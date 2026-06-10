use serde::{Deserialize, Serialize};
use std::{
  mem::size_of,
  sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
  },
  thread::{self, JoinHandle},
  time::{Duration, Instant},
};
use windows_sys::Win32::{
  Foundation::{GetLastError, POINT},
  Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
  },
  System::{
    Power::{
      SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
    },
    SystemInformation::GetTickCount,
  },
  UI::{
    Input::KeyboardAndMouse::{
      GetAsyncKeyState, GetLastInputInfo, SendInput, INPUT, INPUT_0, INPUT_MOUSE,
      LASTINPUTINFO, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEINPUT, VK_END, VK_F10,
      VK_F8, VK_F9, VK_HOME, VK_NEXT, VK_PRIOR,
    },
    WindowsAndMessaging::{GetCursorPos, SetCursorPos},
  },
};

const DEFAULT_IDLE_ACTIVATION_SECONDS: u64 = 150;
const DEFAULT_IDLE_REPEAT_SECONDS: u64 = 5;
const DEFAULT_CONTINUOUS_INTERVAL_SECONDS: u64 = 1;
const MIN_INTERVAL_SECONDS: u64 = 1;
const MAX_INTERVAL_SECONDS: u64 = 3600;
const POLL_INTERVAL_MS: u64 = 100;
const API_RETRY_INTERVAL_SECONDS: u64 = 10;
const SAFE_CORNER_INSET: i32 = 48;
const MOVE_SETTLE_MS: u64 = 60;
const DOUBLE_CLICK_GAP_MS: u64 = 60;
const CONTINUOUS_STOP_DISTANCE: i32 = 6;
const DEFAULT_HOTKEY: &str = "PgDn";
const SUPPORTED_HOTKEYS: [&str; 7] = ["PgDn", "PgUp", "End", "Home", "F8", "F9", "F10"];

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreventSleepRequest {
  enabled: bool,
  click_mode: Option<PreventSleepClickMode>,
  idle_activation_seconds: Option<u64>,
  idle_repeat_seconds: Option<u64>,
  continuous_interval_seconds: Option<u64>,
  continuous_hotkey: Option<String>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PreventSleepClickMode {
  IdleKeepalive,
  Continuous,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreventSleepStatus {
  enabled: bool,
  last_pulse_at: Option<String>,
  error: Option<String>,
  degraded: bool,
  degrade_reason: Option<String>,
  hotkey_armed: bool,
  clicking_active: bool,
}

#[derive(Default)]
pub struct PreventSleepManager {
  worker: Mutex<Option<PreventSleepWorker>>,
  runtime: Arc<PreventSleepRuntime>,
}

#[derive(Default)]
struct PreventSleepRuntime {
  last_pulse_at: Mutex<Option<String>>,
  last_error: Mutex<Option<String>>,
  degrade_reason: Mutex<Option<String>>,
  hotkey_armed: AtomicBool,
  clicking_active: AtomicBool,
}

impl PreventSleepRuntime {
  fn write_last_pulse_at(&self, value: Option<String>) {
    if let Ok(mut last_pulse_at) = self.last_pulse_at.lock() {
      *last_pulse_at = value;
    }
  }

  fn write_error(&self, value: Option<String>) {
    if let Ok(mut last_error) = self.last_error.lock() {
      *last_error = value;
    }
  }

  fn write_degrade_reason(&self, value: Option<String>) {
    if let Ok(mut degrade_reason) = self.degrade_reason.lock() {
      *degrade_reason = value;
    }
  }

  fn set_hotkey_armed(&self, value: bool) {
    self.hotkey_armed.store(value, Ordering::SeqCst);
  }

  fn set_clicking_active(&self, value: bool) {
    self.clicking_active.store(value, Ordering::SeqCst);
  }
}

struct PreventSleepWorker {
  stop: Arc<AtomicBool>,
  handle: JoinHandle<()>,
}

impl PreventSleepManager {
  pub fn set_enabled(&self, request: PreventSleepRequest) -> Result<PreventSleepStatus, String> {
    if request.enabled {
      self.start(request)?;
    } else {
      self.stop();
    }

    Ok(self.status())
  }

  pub fn status(&self) -> PreventSleepStatus {
    let error = self
      .runtime
      .last_error
      .lock()
      .ok()
      .and_then(|value| value.clone());
    let degrade_reason = self
      .runtime
      .degrade_reason
      .lock()
      .ok()
      .and_then(|value| value.clone());

    PreventSleepStatus {
      enabled: self.is_running() && error.is_none(),
      last_pulse_at: self
        .runtime
        .last_pulse_at
        .lock()
        .ok()
        .and_then(|value| value.clone()),
      error,
      degraded: degrade_reason.is_some(),
      degrade_reason,
      hotkey_armed: self.runtime.hotkey_armed.load(Ordering::SeqCst),
      clicking_active: self.runtime.clicking_active.load(Ordering::SeqCst),
    }
  }

  pub fn stop(&self) {
    let worker = self.worker.lock().ok().and_then(|mut worker| worker.take());

    if let Some(worker) = worker {
      worker.stop.store(true, Ordering::SeqCst);
      let _ = worker.handle.join();
    }

    release_execution_state();
    self.runtime.write_error(None);
    self.runtime.write_degrade_reason(None);
    self.runtime.write_last_pulse_at(None);
    self.runtime.set_hotkey_armed(false);
    self.runtime.set_clicking_active(false);
  }

  fn start(&self, request: PreventSleepRequest) -> Result<(), String> {
    self.stop();
    self.runtime.write_error(None);
    self.runtime.write_degrade_reason(None);
    self.runtime.write_last_pulse_at(None);

    let config = WorkerConfig::from_request(request);
    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_thread = Arc::clone(&stop);
    let runtime = Arc::clone(&self.runtime);

    if matches!(config.click_mode, PreventSleepClickMode::Continuous) {
      runtime.set_hotkey_armed(true);
    }

    let handle = thread::Builder::new()
      .name("prevent-sleep".into())
      .spawn(move || {
        run_worker(stop_for_thread, config, runtime);
      })
      .map_err(|error| format!("prevent sleep worker failed to start: {error}"))?;

    if let Ok(mut worker) = self.worker.lock() {
      *worker = Some(PreventSleepWorker { stop, handle });
      Ok(())
    } else {
      Err("prevent sleep manager lock failed".into())
    }
  }

  fn is_running(&self) -> bool {
    self.worker.lock().map(|worker| worker.is_some()).unwrap_or(false)
  }
}

impl Drop for PreventSleepManager {
  fn drop(&mut self) {
    self.stop();
  }
}

#[derive(Clone)]
struct WorkerConfig {
  click_mode: PreventSleepClickMode,
  idle_activation: Duration,
  idle_repeat: Duration,
  continuous_interval: Duration,
  continuous_hotkey: String,
}

impl WorkerConfig {
  fn from_request(request: PreventSleepRequest) -> Self {
    Self {
      click_mode: request.click_mode.unwrap_or(PreventSleepClickMode::IdleKeepalive),
      idle_activation: Duration::from_secs(clamp_seconds(
        request
          .idle_activation_seconds
          .unwrap_or(DEFAULT_IDLE_ACTIVATION_SECONDS),
      )),
      idle_repeat: Duration::from_secs(clamp_seconds(
        request.idle_repeat_seconds.unwrap_or(DEFAULT_IDLE_REPEAT_SECONDS),
      )),
      continuous_interval: Duration::from_secs(clamp_seconds(
        request
          .continuous_interval_seconds
          .unwrap_or(DEFAULT_CONTINUOUS_INTERVAL_SECONDS),
      )),
      continuous_hotkey: sanitize_hotkey(request.continuous_hotkey.as_deref()),
    }
  }
}

fn clamp_seconds(value: u64) -> u64 {
  value.clamp(MIN_INTERVAL_SECONDS, MAX_INTERVAL_SECONDS)
}

fn sanitize_hotkey(value: Option<&str>) -> String {
  value
    .filter(|hotkey| SUPPORTED_HOTKEYS.contains(hotkey))
    .unwrap_or(DEFAULT_HOTKEY)
    .to_string()
}

fn run_worker(stop: Arc<AtomicBool>, config: WorkerConfig, runtime: Arc<PreventSleepRuntime>) {
  let mut last_api_failure_at: Option<Instant> = None;
  let mut last_hotkey_down = false;
  let mut continuous_anchor: Option<POINT> = None;
  let mut next_continuous_pulse_at: Option<Instant> = None;

  loop {
    if stop.load(Ordering::SeqCst) {
      break;
    }

    if should_try_api(last_api_failure_at) {
      match apply_execution_state() {
        Ok(()) => {
          runtime.write_degrade_reason(None);
          last_api_failure_at = None;
        }
        Err(error) => {
          runtime.write_degrade_reason(Some(error));
          last_api_failure_at = Some(Instant::now());
        }
      }
    }

    let action_result = match config.click_mode {
      PreventSleepClickMode::IdleKeepalive => run_idle_keepalive(&stop, &config, &runtime),
      PreventSleepClickMode::Continuous => run_continuous_mode(
        &stop,
        &config,
        &runtime,
        &mut last_hotkey_down,
        &mut continuous_anchor,
        &mut next_continuous_pulse_at,
      ),
    };

    match action_result {
      WorkerStep::PulseSuccess => {
        runtime.write_error(None);
        runtime.write_last_pulse_at(Some(now_isoish()));
      }
      WorkerStep::Skipped => {}
      WorkerStep::PulseFailure(error) => {
        runtime.write_error(Some(error));
      }
      WorkerStep::Stopped => break,
    }
  }

  release_execution_state();
}

enum WorkerStep {
  PulseSuccess,
  Skipped,
  PulseFailure(String),
  Stopped,
}

fn run_idle_keepalive(
  stop: &AtomicBool,
  config: &WorkerConfig,
  runtime: &PreventSleepRuntime,
) -> WorkerStep {
  runtime.set_hotkey_armed(false);
  runtime.set_clicking_active(false);

  match idle_duration() {
    Ok(idle_for) if idle_for >= config.idle_activation => {
      if let Ok(idle_now) = idle_duration() {
        if idle_now < config.idle_activation {
          sleep_until_stop(stop, Duration::from_millis(POLL_INTERVAL_MS));
          return WorkerStep::Skipped;
        }
      }

      match pulse_mouse_double_click_at_corner() {
        Ok(()) => {
          if sleep_until_stop(stop, config.idle_repeat) {
            WorkerStep::Stopped
          } else {
            WorkerStep::PulseSuccess
          }
        }
        Err(error) => WorkerStep::PulseFailure(error),
      }
    }
    Ok(_) => {
      if sleep_until_stop(stop, Duration::from_millis(POLL_INTERVAL_MS)) {
        WorkerStep::Stopped
      } else {
        WorkerStep::Skipped
      }
    }
    Err(error) => WorkerStep::PulseFailure(error),
  }
}

fn run_continuous_mode(
  stop: &AtomicBool,
  config: &WorkerConfig,
  runtime: &PreventSleepRuntime,
  last_hotkey_down: &mut bool,
  continuous_anchor: &mut Option<POINT>,
  next_continuous_pulse_at: &mut Option<Instant>,
) -> WorkerStep {
  runtime.set_hotkey_armed(true);

  let hotkey_down = hotkey_pressed(&config.continuous_hotkey);
  if hotkey_down && !*last_hotkey_down {
    if runtime.clicking_active.load(Ordering::SeqCst) {
      runtime.set_clicking_active(false);
      *continuous_anchor = None;
      *next_continuous_pulse_at = None;
    } else {
      match cursor_position() {
        Ok(point) => {
          runtime.set_clicking_active(true);
          *continuous_anchor = Some(point);
          *next_continuous_pulse_at = Some(Instant::now());
        }
        Err(error) => {
          *last_hotkey_down = hotkey_down;
          return WorkerStep::PulseFailure(error);
        }
      }
    }
  }
  *last_hotkey_down = hotkey_down;

  if !runtime.clicking_active.load(Ordering::SeqCst) {
    if sleep_until_stop(stop, Duration::from_millis(POLL_INTERVAL_MS)) {
      return WorkerStep::Stopped;
    }
    return WorkerStep::Skipped;
  }

  let Some(anchor) = *continuous_anchor else {
    runtime.set_clicking_active(false);
    *next_continuous_pulse_at = None;
    return WorkerStep::Skipped;
  };

  match cursor_position() {
    Ok(current_cursor) if point_moved_from_anchor(anchor, current_cursor) => {
      runtime.set_clicking_active(false);
      *continuous_anchor = None;
      *next_continuous_pulse_at = None;

      if sleep_until_stop(stop, Duration::from_millis(POLL_INTERVAL_MS)) {
        return WorkerStep::Stopped;
      }
      return WorkerStep::Skipped;
    }
    Ok(_) => {}
    Err(error) => return WorkerStep::PulseFailure(error),
  }

  let next_pulse_at = next_continuous_pulse_at.get_or_insert_with(Instant::now);
  if Instant::now() < *next_pulse_at {
    if sleep_until_stop(stop, Duration::from_millis(POLL_INTERVAL_MS)) {
      return WorkerStep::Stopped;
    }
    return WorkerStep::Skipped;
  }

  match pulse_mouse_double_click_at_point(anchor) {
    Ok(()) => {
      *next_continuous_pulse_at = Some(Instant::now() + config.continuous_interval);
      WorkerStep::PulseSuccess
    }
    Err(error) => WorkerStep::PulseFailure(error),
  }
}

fn point_moved_from_anchor(anchor: POINT, current: POINT) -> bool {
  (current.x - anchor.x).abs() > CONTINUOUS_STOP_DISTANCE
    || (current.y - anchor.y).abs() > CONTINUOUS_STOP_DISTANCE
}

fn hotkey_pressed(hotkey: &str) -> bool {
  let virtual_key = match hotkey {
    "PgDn" => Some(VK_NEXT),
    "PgUp" => Some(VK_PRIOR),
    "End" => Some(VK_END),
    "Home" => Some(VK_HOME),
    "F8" => Some(VK_F8),
    "F9" => Some(VK_F9),
    "F10" => Some(VK_F10),
    _ => None,
  };

  let Some(virtual_key) = virtual_key else {
    return false;
  };

  unsafe { GetAsyncKeyState(virtual_key.into()) < 0 }
}

fn should_try_api(last_api_failure_at: Option<Instant>) -> bool {
  match last_api_failure_at {
    None => true,
    Some(last_failure) => {
      last_failure.elapsed() >= Duration::from_secs(API_RETRY_INTERVAL_SECONDS)
    }
  }
}

fn sleep_until_stop(stop: &AtomicBool, duration: Duration) -> bool {
  let started = Instant::now();
  while !stop.load(Ordering::SeqCst) && started.elapsed() < duration {
    thread::sleep(Duration::from_millis(50));
  }
  stop.load(Ordering::SeqCst)
}

fn apply_execution_state() -> Result<(), String> {
  let result =
    unsafe { SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED) };

  if result == 0 {
    Err(last_os_error("SetThreadExecutionState failed"))
  } else {
    Ok(())
  }
}

fn release_execution_state() {
  unsafe {
    SetThreadExecutionState(ES_CONTINUOUS);
  }
}

fn idle_duration() -> Result<Duration, String> {
  let last_input = last_input_tick()?;
  let elapsed_ms = current_tick().wrapping_sub(last_input);
  Ok(Duration::from_millis(u64::from(elapsed_ms)))
}

fn last_input_tick() -> Result<u32, String> {
  let mut info = LASTINPUTINFO {
    cbSize: size_of::<LASTINPUTINFO>() as u32,
    dwTime: 0,
  };

  let ok = unsafe { GetLastInputInfo(&mut info) };
  if ok == 0 {
    return Err(last_os_error("GetLastInputInfo failed"));
  }

  Ok(info.dwTime)
}

fn pulse_mouse_double_click_at_corner() -> Result<(), String> {
  let anchor = cursor_position()?;
  let point = safe_corner_point(anchor)?;
  pulse_mouse_double_click_at_point(point)
}

fn pulse_mouse_double_click_at_point(point: POINT) -> Result<(), String> {
  set_cursor_position(point)?;
  thread::sleep(Duration::from_millis(MOVE_SETTLE_MS));
  send_left_click()?;
  thread::sleep(Duration::from_millis(DOUBLE_CLICK_GAP_MS));
  send_left_click()?;
  Ok(())
}

fn cursor_position() -> Result<POINT, String> {
  let mut point = POINT { x: 0, y: 0 };
  let ok = unsafe { GetCursorPos(&mut point) };

  if ok == 0 {
    Err(last_os_error("GetCursorPos failed"))
  } else {
    Ok(point)
  }
}

fn safe_corner_point(anchor: POINT) -> Result<POINT, String> {
  let monitor = unsafe { MonitorFromPoint(anchor, MONITOR_DEFAULTTONEAREST) };
  if monitor.is_null() {
    return Err(last_os_error("MonitorFromPoint failed"));
  }

  let mut info = MONITORINFO {
    cbSize: size_of::<MONITORINFO>() as u32,
    rcMonitor: Default::default(),
    rcWork: Default::default(),
    dwFlags: 0,
  };
  let ok = unsafe { GetMonitorInfoW(monitor, &mut info) };
  if ok == 0 {
    return Err(last_os_error("GetMonitorInfoW failed"));
  }

  Ok(POINT {
    x: info.rcWork.left + SAFE_CORNER_INSET,
    y: info.rcWork.bottom - SAFE_CORNER_INSET,
  })
}

fn set_cursor_position(point: POINT) -> Result<(), String> {
  let ok = unsafe { SetCursorPos(point.x, point.y) };

  if ok == 0 {
    Err(last_os_error("SetCursorPos failed"))
  } else {
    Ok(())
  }
}

fn send_left_click() -> Result<(), String> {
  let inputs = [
    mouse_input(MOUSEEVENTF_LEFTDOWN),
    mouse_input(MOUSEEVENTF_LEFTUP),
  ];
  let sent =
    unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), size_of::<INPUT>() as i32) };

  if sent != inputs.len() as u32 {
    Err(last_os_error("SendInput failed"))
  } else {
    Ok(())
  }
}

fn mouse_input(flags: u32) -> INPUT {
  INPUT {
    r#type: INPUT_MOUSE,
    Anonymous: INPUT_0 {
      mi: MOUSEINPUT {
        dx: 0,
        dy: 0,
        mouseData: 0,
        dwFlags: flags,
        time: 0,
        dwExtraInfo: 0,
      },
    },
  }
}

fn last_os_error(prefix: &str) -> String {
  let code = unsafe { GetLastError() };
  format!("{prefix}: Windows error {code}")
}

fn current_tick() -> u32 {
  unsafe { GetTickCount() }
}

fn now_isoish() -> String {
  chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
  use super::{
    hotkey_pressed, point_moved_from_anchor, sanitize_hotkey, PreventSleepClickMode,
    PreventSleepManager, PreventSleepRequest, WorkerConfig, DEFAULT_HOTKEY,
  };
  use windows_sys::Win32::Foundation::POINT;
  use std::time::Duration;

  #[test]
  fn worker_config_uses_request_values() {
    let config = WorkerConfig::from_request(PreventSleepRequest {
      enabled: true,
      click_mode: Some(PreventSleepClickMode::Continuous),
      idle_activation_seconds: Some(45),
      idle_repeat_seconds: Some(12),
      continuous_interval_seconds: Some(3),
      continuous_hotkey: Some("F9".into()),
    });

    assert!(matches!(config.click_mode, PreventSleepClickMode::Continuous));
    assert_eq!(config.idle_activation, Duration::from_secs(45));
    assert_eq!(config.idle_repeat, Duration::from_secs(12));
    assert_eq!(config.continuous_interval, Duration::from_secs(3));
    assert_eq!(config.continuous_hotkey, "F9");
  }

  #[test]
  fn worker_config_defaults_to_pgdn() {
    let config = WorkerConfig::from_request(PreventSleepRequest {
      enabled: true,
      click_mode: Some(PreventSleepClickMode::Continuous),
      idle_activation_seconds: None,
      idle_repeat_seconds: None,
      continuous_interval_seconds: None,
      continuous_hotkey: None,
    });

    assert_eq!(config.continuous_hotkey, DEFAULT_HOTKEY);
  }

  #[test]
  fn unsupported_hotkey_defaults_to_pgdn() {
    let config = WorkerConfig::from_request(PreventSleepRequest {
      enabled: true,
      click_mode: Some(PreventSleepClickMode::Continuous),
      idle_activation_seconds: None,
      idle_repeat_seconds: None,
      continuous_interval_seconds: None,
      continuous_hotkey: Some("Shift".into()),
    });

    assert_eq!(config.continuous_hotkey, DEFAULT_HOTKEY);
  }

  #[test]
  fn sanitize_hotkey_keeps_supported_values() {
    assert_eq!(sanitize_hotkey(Some("F9")), "F9");
    assert_eq!(sanitize_hotkey(Some("Invalid")), DEFAULT_HOTKEY);
    assert_eq!(sanitize_hotkey(None), DEFAULT_HOTKEY);
  }

  #[test]
  fn stop_clears_stale_runtime_state() {
    let manager = PreventSleepManager::default();
    manager.runtime.write_error(Some("temporary native error".into()));
    manager.runtime.write_degrade_reason(Some("mouse-only fallback".into()));
    manager.runtime.write_last_pulse_at(Some("2026-06-09T00:00:00Z".into()));
    manager.runtime.set_hotkey_armed(true);
    manager.runtime.set_clicking_active(true);

    manager.stop();

    let status = manager.status();
    assert!(!status.enabled);
    assert_eq!(status.error, None);
    assert_eq!(status.degrade_reason, None);
    assert_eq!(status.last_pulse_at, None);
    assert!(!status.hotkey_armed);
    assert!(!status.clicking_active);
  }

  #[test]
  fn unknown_hotkey_is_not_pressed() {
    assert!(!hotkey_pressed("Unknown"));
  }

  #[test]
  fn cursor_move_threshold_detects_manual_stop() {
    let anchor = POINT { x: 120, y: 240 };
    assert!(!point_moved_from_anchor(anchor, POINT { x: 123, y: 243 }));
    assert!(point_moved_from_anchor(anchor, POINT { x: 140, y: 240 }));
  }
}
