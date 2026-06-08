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
      GetLastInputInfo, SendInput, INPUT, INPUT_0, INPUT_MOUSE, LASTINPUTINFO,
      MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEINPUT,
    },
    WindowsAndMessaging::{GetCursorPos, SetCursorPos},
  },
};

const DEFAULT_IDLE_THRESHOLD_SECONDS: u64 = 150;
const MIN_IDLE_THRESHOLD_SECONDS: u64 = 30;
const MAX_IDLE_THRESHOLD_SECONDS: u64 = 600;
const POLL_INTERVAL_MS: u64 = 1_000;
const POST_PULSE_COOLDOWN_MS: u64 = 2_000;
const SAFE_CORNER_INSET: i32 = 18;
const MOVE_SETTLE_MS: u64 = 80;
const CLICK_HOLD_MS: u64 = 45;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreventSleepRequest {
  enabled: bool,
  idle_threshold_seconds: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreventSleepStatus {
  enabled: bool,
  last_pulse_at: Option<String>,
  error: Option<String>,
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
}

struct PreventSleepWorker {
  stop: Arc<AtomicBool>,
  handle: JoinHandle<()>,
}

impl PreventSleepManager {
  pub fn set_enabled(&self, request: PreventSleepRequest) -> Result<PreventSleepStatus, String> {
    if request.enabled {
      self.start(request.idle_threshold_seconds)?;
    } else {
      self.stop();
    }

    Ok(self.status())
  }

  pub fn status(&self) -> PreventSleepStatus {
    PreventSleepStatus {
      enabled: self.is_running(),
      last_pulse_at: self
        .runtime
        .last_pulse_at
        .lock()
        .ok()
        .and_then(|value| value.clone()),
      error: self
        .runtime
        .last_error
        .lock()
        .ok()
        .and_then(|value| value.clone()),
    }
  }

  pub fn stop(&self) {
    let worker = self.worker.lock().ok().and_then(|mut worker| worker.take());

    if let Some(worker) = worker {
      worker.stop.store(true, Ordering::SeqCst);
      let _ = worker.handle.join();
    }

    release_execution_state();
    self.runtime.write_last_pulse_at(None);
  }

  fn start(&self, idle_threshold_seconds: Option<u64>) -> Result<(), String> {
    self.stop();
    self.set_error(None);
    self.runtime.write_last_pulse_at(None);

    let idle_threshold_seconds = idle_threshold_seconds
      .unwrap_or(DEFAULT_IDLE_THRESHOLD_SECONDS)
      .clamp(MIN_IDLE_THRESHOLD_SECONDS, MAX_IDLE_THRESHOLD_SECONDS);

    apply_execution_state()?;

    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_thread = Arc::clone(&stop);
    let runtime = Arc::clone(&self.runtime);

    let handle = thread::Builder::new()
      .name("prevent-sleep".into())
      .spawn(move || {
        run_worker(stop_for_thread, idle_threshold_seconds, runtime);
      })
      .map_err(|error| {
        release_execution_state();
        format!("prevent sleep worker failed to start: {error}")
      })?;

    if let Ok(mut worker) = self.worker.lock() {
      *worker = Some(PreventSleepWorker { stop, handle });
      Ok(())
    } else {
      release_execution_state();
      Err("prevent sleep manager lock failed".into())
    }
  }

  fn is_running(&self) -> bool {
    self.worker.lock().map(|worker| worker.is_some()).unwrap_or(false)
  }

  fn set_error(&self, next_error: Option<String>) {
    if let Ok(mut error) = self.runtime.last_error.lock() {
      *error = next_error;
    }
  }
}

impl Drop for PreventSleepManager {
  fn drop(&mut self) {
    self.stop();
  }
}

fn run_worker(
  stop: Arc<AtomicBool>,
  idle_threshold_seconds: u64,
  runtime: Arc<PreventSleepRuntime>,
) {
  let idle_threshold = Duration::from_secs(idle_threshold_seconds);
  let mut next_allowed_pulse = Instant::now();

  while !stop.load(Ordering::SeqCst) {
    if let Err(error) = apply_execution_state() {
      runtime.write_error(Some(error));
    }

    match idle_duration() {
      Ok(idle_for) if idle_for >= idle_threshold && Instant::now() >= next_allowed_pulse => {
        match pulse_mouse() {
          Ok(()) => {
            runtime.write_error(None);
            runtime.write_last_pulse_at(Some(now_isoish()));
            next_allowed_pulse =
              Instant::now() + idle_threshold + Duration::from_millis(POST_PULSE_COOLDOWN_MS);
          }
          Err(error) => {
            runtime.write_error(Some(error));
            next_allowed_pulse = Instant::now() + Duration::from_secs(10);
          }
        }
      }
      Ok(_) => {}
      Err(error) => {
        runtime.write_error(Some(error));
      }
    }

    sleep_until_stop(&stop, Duration::from_millis(POLL_INTERVAL_MS));
  }

  release_execution_state();
}

fn sleep_until_stop(stop: &AtomicBool, duration: Duration) {
  let started = Instant::now();
  while !stop.load(Ordering::SeqCst) && started.elapsed() < duration {
    thread::sleep(Duration::from_millis(50));
  }
}

fn apply_execution_state() -> Result<(), String> {
  let result = unsafe {
    SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED)
  };

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
  let mut info = LASTINPUTINFO {
    cbSize: size_of::<LASTINPUTINFO>() as u32,
    dwTime: 0,
  };

  let ok = unsafe { GetLastInputInfo(&mut info) };
  if ok == 0 {
    return Err(last_os_error("GetLastInputInfo failed"));
  }

  let now = unsafe { GetTickCount() };
  let elapsed_ms = now.wrapping_sub(info.dwTime);
  Ok(Duration::from_millis(u64::from(elapsed_ms)))
}

fn pulse_mouse() -> Result<(), String> {
  let original = cursor_position()?;
  let target = safe_left_bottom_point(original)?;

  set_cursor_position(target)?;
  thread::sleep(Duration::from_millis(MOVE_SETTLE_MS));
  send_left_click()?;
  thread::sleep(Duration::from_millis(CLICK_HOLD_MS));
  set_cursor_position(original)?;

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

fn safe_left_bottom_point(anchor: POINT) -> Result<POINT, String> {
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
  let sent = unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), size_of::<INPUT>() as i32) };

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

fn now_isoish() -> String {
  chrono::Utc::now().to_rfc3339()
}
