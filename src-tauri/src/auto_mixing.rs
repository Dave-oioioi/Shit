use serde::{Deserialize, Serialize};
use std::{
  collections::{BTreeMap, BTreeSet},
  sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
  },
  thread::{self, JoinHandle},
  time::{Duration, Instant},
};
use windows::{
  core::{Interface, PWSTR},
  Win32::{
    Foundation::CloseHandle,
    Media::Audio::{
      eMultimedia, eRender, AudioSessionStateActive, IAudioSessionControl,
      IAudioSessionControl2, IAudioSessionEnumerator, IAudioSessionManager2, IMMDevice,
      IMMDeviceEnumerator, ISimpleAudioVolume, MMDeviceEnumerator,
    },
    System::{
      Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
        COINIT_MULTITHREADED,
      },
      Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
      },
    },
  },
};

const DEFAULT_DUCKED_VOLUME_PERCENT: u8 = 15;
const DEFAULT_RESTORE_DURATION_MS: u64 = 300;
const POLL_INTERVAL_MS: u64 = 200;
const MAX_DUCKED_VOLUME_PERCENT: u8 = 100;
const MIN_RESTORE_DURATION_MS: u64 = 0;
const MAX_RESTORE_DURATION_MS: u64 = 10_000;
const VOLUME_EPSILON: f32 = 0.02;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoMixingRequest {
  enabled: bool,
  #[serde(default)]
  selected_executables: Vec<String>,
  #[serde(default)]
  blocked_executables: Vec<String>,
  ducked_volume_percent: Option<u8>,
  restore_duration_ms: Option<u64>,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AutoMixingRuntimeStatus {
  Idle,
  Running,
  Error,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoMixingStatus {
  enabled: bool,
  status: AutoMixingRuntimeStatus,
  runtime_error: Option<String>,
  active_duck_count: usize,
  observed_session_count: usize,
  last_action_at: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoMixingTarget {
  executable_name: String,
  display_name: String,
  process_id: Option<u32>,
  has_audio_session: bool,
  is_running: bool,
}

#[derive(Default)]
pub struct AutoMixingManager {
  worker: Mutex<Option<AutoMixingWorker>>,
  runtime: Arc<AutoMixingRuntime>,
}

#[derive(Default)]
struct AutoMixingRuntime {
  runtime_error: Mutex<Option<String>>,
  active_duck_count: Mutex<usize>,
  observed_session_count: Mutex<usize>,
  last_action_at: Mutex<Option<String>>,
}

impl AutoMixingRuntime {
  fn write_runtime_error(&self, value: Option<String>) {
    if let Ok(mut runtime_error) = self.runtime_error.lock() {
      *runtime_error = value;
    }
  }

  fn write_active_duck_count(&self, value: usize) {
    if let Ok(mut active_duck_count) = self.active_duck_count.lock() {
      *active_duck_count = value;
    }
  }

  fn write_observed_session_count(&self, value: usize) {
    if let Ok(mut observed_session_count) = self.observed_session_count.lock() {
      *observed_session_count = value;
    }
  }

  fn write_last_action_at(&self, value: Option<String>) {
    if let Ok(mut last_action_at) = self.last_action_at.lock() {
      *last_action_at = value;
    }
  }
}

struct AutoMixingWorker {
  stop: Arc<AtomicBool>,
  handle: JoinHandle<()>,
}

#[derive(Clone)]
struct WorkerConfig {
  selected_executables: BTreeSet<String>,
  blocked_executables: BTreeSet<String>,
  ducked_volume: f32,
  restore_duration: Duration,
}

#[derive(Clone)]
struct SessionSnapshot {
  session_key: String,
  executable_name: String,
  display_name: String,
  process_id: u32,
  active: bool,
  volume: ISimpleAudioVolume,
  current_volume: f32,
}

struct DuckedSession {
  executable_name: String,
  original_volume: f32,
  expected_ducked_volume: f32,
  volume: ISimpleAudioVolume,
  manual_override: bool,
}

#[derive(Clone)]
struct ProcessSnapshot {
  executable_name: String,
  display_name: String,
  process_id: u32,
}

struct ComGuard;

impl ComGuard {
  fn new() -> Result<Self, String> {
    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
      .ok()
      .map_err(|error| format!("CoInitializeEx failed: {error}"))?;
    Ok(Self)
  }
}

impl Drop for ComGuard {
  fn drop(&mut self) {
    unsafe {
      CoUninitialize();
    }
  }
}

impl AutoMixingManager {
  pub fn set_enabled(&self, request: AutoMixingRequest) -> Result<AutoMixingStatus, String> {
    self.runtime.write_last_action_at(Some(now_isoish()));

    if request.enabled {
      self.start(request)?;
    } else {
      self.stop();
    }

    Ok(self.status())
  }

  pub fn status(&self) -> AutoMixingStatus {
    let runtime_error = self
      .runtime
      .runtime_error
      .lock()
      .ok()
      .and_then(|value| value.clone());
    let active_duck_count = self
      .runtime
      .active_duck_count
      .lock()
      .map(|value| *value)
      .unwrap_or(0);
    let observed_session_count = self
      .runtime
      .observed_session_count
      .lock()
      .map(|value| *value)
      .unwrap_or(0);
    let enabled = self.is_running() && runtime_error.is_none();

    AutoMixingStatus {
      enabled,
      status: if runtime_error.is_some() {
        AutoMixingRuntimeStatus::Error
      } else if enabled {
        AutoMixingRuntimeStatus::Running
      } else {
        AutoMixingRuntimeStatus::Idle
      },
      runtime_error,
      active_duck_count,
      observed_session_count,
      last_action_at: self
        .runtime
        .last_action_at
        .lock()
        .ok()
        .and_then(|value| value.clone()),
    }
  }

  pub fn list_targets(&self) -> Result<Vec<AutoMixingTarget>, String> {
    let handle = thread::Builder::new()
      .name("auto-mixing-targets".into())
      .spawn(list_targets_once)
      .map_err(|error| format!("auto mixing target listing failed to start: {error}"))?;

    handle
      .join()
      .map_err(|_| "auto mixing target listing panicked".to_string())?
  }

  pub fn stop(&self) {
    let worker = self.worker.lock().ok().and_then(|mut worker| worker.take());

    if let Some(worker) = worker {
      worker.stop.store(true, Ordering::SeqCst);
      let _ = worker.handle.join();
    }

    self.runtime.write_runtime_error(None);
    self.runtime.write_active_duck_count(0);
    self.runtime.write_observed_session_count(0);
  }

  fn start(&self, request: AutoMixingRequest) -> Result<(), String> {
    self.stop();
    self.runtime.write_runtime_error(None);
    self.runtime.write_active_duck_count(0);
    self.runtime.write_observed_session_count(0);

    let config = WorkerConfig::from_request(request);
    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_thread = Arc::clone(&stop);
    let runtime = Arc::clone(&self.runtime);

    let handle = thread::Builder::new()
      .name("auto-mixing".into())
      .spawn(move || {
        run_worker(stop_for_thread, config, runtime);
      })
      .map_err(|error| format!("auto mixing worker failed to start: {error}"))?;

    if let Ok(mut worker) = self.worker.lock() {
      *worker = Some(AutoMixingWorker { stop, handle });
      Ok(())
    } else {
      Err("auto mixing manager lock failed".into())
    }
  }

  fn is_running(&self) -> bool {
    self.worker.lock().map(|worker| worker.is_some()).unwrap_or(false)
  }
}

impl Drop for AutoMixingManager {
  fn drop(&mut self) {
    self.stop();
  }
}

impl WorkerConfig {
  fn from_request(request: AutoMixingRequest) -> Self {
    let blocked_executables = sanitize_executables(&request.blocked_executables);
    let selected_executables =
      sanitize_executables(&request.selected_executables)
        .into_iter()
        .filter(|executable| !blocked_executables.contains(executable))
        .collect();

    Self {
      selected_executables,
      blocked_executables,
      ducked_volume: f32::from(
        request
          .ducked_volume_percent
          .unwrap_or(DEFAULT_DUCKED_VOLUME_PERCENT)
          .min(MAX_DUCKED_VOLUME_PERCENT),
      ) / 100.0,
      restore_duration: Duration::from_millis(
        request
          .restore_duration_ms
          .unwrap_or(DEFAULT_RESTORE_DURATION_MS)
          .clamp(MIN_RESTORE_DURATION_MS, MAX_RESTORE_DURATION_MS),
      ),
    }
  }
}

fn sanitize_executables(executables: &[String]) -> BTreeSet<String> {
  executables
    .iter()
    .map(|value| value.trim().to_ascii_lowercase())
    .filter(|value| !value.is_empty() && value.ends_with(".exe"))
    .collect()
}

fn run_worker(stop: Arc<AtomicBool>, config: WorkerConfig, runtime: Arc<AutoMixingRuntime>) {
  let _com = match ComGuard::new() {
    Ok(com) => com,
    Err(error) => {
      runtime.write_runtime_error(Some(error));
      return;
    }
  };

  let mut tracked_sessions: BTreeMap<String, DuckedSession> = BTreeMap::new();
  let mut current_device_id: Option<String> = None;

  loop {
    if stop.load(Ordering::SeqCst) {
      restore_all_sessions(&mut tracked_sessions, config.restore_duration, &stop);
      break;
    }

    match enumerate_running_processes()
      .map(|processes| processes_by_id(&processes))
      .and_then(|processes| enumerate_default_output_sessions(&processes))
    {
      Ok((device_id, sessions)) => {
        if current_device_id.as_deref() != Some(device_id.as_str()) {
          restore_all_sessions(&mut tracked_sessions, config.restore_duration, &stop);
          current_device_id = Some(device_id);
        }

        runtime.write_runtime_error(None);
        runtime.write_observed_session_count(sessions.len());
        apply_ducking_round(&config, &sessions, &mut tracked_sessions, &stop);
        runtime.write_active_duck_count(
          tracked_sessions
            .values()
            .filter(|session| !session.manual_override)
            .count(),
        );
      }
      Err(error) => {
        restore_all_sessions(&mut tracked_sessions, config.restore_duration, &stop);
        runtime.write_runtime_error(Some(error));
        runtime.write_active_duck_count(0);
        runtime.write_observed_session_count(0);
      }
    }

    if sleep_until_stop(&stop, Duration::from_millis(POLL_INTERVAL_MS)) {
      restore_all_sessions(&mut tracked_sessions, config.restore_duration, &stop);
      break;
    }
  }
}

fn apply_ducking_round(
  config: &WorkerConfig,
  sessions: &[SessionSnapshot],
  tracked_sessions: &mut BTreeMap<String, DuckedSession>,
  stop: &AtomicBool,
) {
  let active_trigger_executables = compute_active_trigger_executables(
    sessions,
    &config.blocked_executables,
  );
  let active_sessions: BTreeMap<&str, &SessionSnapshot> = sessions
    .iter()
    .map(|session| (session.session_key.as_str(), session))
    .collect();

  for session in sessions {
    let should_duck = should_duck_session(
      &session.executable_name,
      &active_trigger_executables,
      &config.selected_executables,
      &config.blocked_executables,
    );

    if should_duck {
      match tracked_sessions.get_mut(&session.session_key) {
        Some(tracked) => {
          if tracked.manual_override {
            continue;
          }

          if user_changed_ducked_volume(
            tracked.original_volume,
            tracked.expected_ducked_volume,
            session.current_volume,
          ) {
            tracked.manual_override = true;
            continue;
          }

          if (session.current_volume - tracked.expected_ducked_volume).abs() > VOLUME_EPSILON {
            let _ = set_session_volume(&tracked.volume, tracked.expected_ducked_volume);
          }
        }
        None => {
          if set_session_volume(&session.volume, config.ducked_volume).is_ok() {
            tracked_sessions.insert(
              session.session_key.clone(),
              DuckedSession {
                executable_name: session.executable_name.clone(),
                original_volume: session.current_volume,
                expected_ducked_volume: config.ducked_volume,
                volume: session.volume.clone(),
                manual_override: false,
              },
            );
          }
        }
      }
    }
  }

  let stale_keys: Vec<String> = tracked_sessions
    .keys()
    .filter(|key| !active_sessions.contains_key(key.as_str()))
    .cloned()
    .collect();

  for key in stale_keys {
    tracked_sessions.remove(&key);
  }

  let to_release: Vec<String> = tracked_sessions
    .iter()
    .filter_map(|(key, tracked)| {
      let active_session = active_sessions.get(key.as_str())?;
      let still_selected = config.selected_executables.contains(&tracked.executable_name);
      let still_blocked = config.blocked_executables.contains(&tracked.executable_name);
      let trigger_remains = should_duck_session(
        &tracked.executable_name,
        &active_trigger_executables,
        &config.selected_executables,
        &config.blocked_executables,
      );

      if still_selected && !still_blocked && trigger_remains && active_session.active {
        None
      } else {
        Some(key.clone())
      }
    })
    .collect();

  for key in to_release {
    if let Some(tracked) = tracked_sessions.remove(&key) {
      if !tracked.manual_override {
        let _ = restore_session_volume(
          &tracked.volume,
          tracked.original_volume,
          config.restore_duration,
          stop,
        );
      }
    }
  }
}

fn restore_all_sessions(
  tracked_sessions: &mut BTreeMap<String, DuckedSession>,
  restore_duration: Duration,
  stop: &AtomicBool,
) {
  let sessions = tracked_sessions
    .values()
    .map(|tracked| {
      (
        tracked.manual_override,
        tracked.volume.clone(),
        tracked.original_volume,
      )
    })
    .collect::<Vec<_>>();

  tracked_sessions.clear();

  for (manual_override, volume, original_volume) in sessions {
    if manual_override {
      continue;
    }

    let _ = restore_session_volume(&volume, original_volume, restore_duration, stop);
  }
}

fn compute_active_trigger_executables(
  sessions: &[SessionSnapshot],
  blocked_executables: &BTreeSet<String>,
) -> BTreeSet<String> {
  compute_active_trigger_executables_from_iter(
    sessions
      .iter()
      .map(|session| (session.executable_name.as_str(), session.active)),
    blocked_executables,
  )
}

fn compute_active_trigger_executables_from_iter<'a>(
  sessions: impl IntoIterator<Item = (&'a str, bool)>,
  blocked_executables: &BTreeSet<String>,
) -> BTreeSet<String> {
  sessions
    .into_iter()
    .filter(|(executable_name, active)| {
      *active && !blocked_executables.contains(&executable_name.to_ascii_lowercase())
    })
    .map(|(executable_name, _)| executable_name.to_ascii_lowercase())
    .collect()
}

fn should_duck_session(
  executable_name: &str,
  active_trigger_executables: &BTreeSet<String>,
  selected_executables: &BTreeSet<String>,
  blocked_executables: &BTreeSet<String>,
) -> bool {
  selected_executables.contains(executable_name)
    && !blocked_executables.contains(executable_name)
    && active_trigger_executables
      .iter()
      .any(|trigger| trigger != executable_name)
}

fn user_changed_ducked_volume(original: f32, expected: f32, current: f32) -> bool {
  (current - expected).abs() > VOLUME_EPSILON && (current - original).abs() > VOLUME_EPSILON
}

fn restore_session_volume(
  volume: &ISimpleAudioVolume,
  original_volume: f32,
  duration: Duration,
  stop: &AtomicBool,
) -> Result<(), String> {
  if duration.is_zero() {
    return set_session_volume(volume, original_volume);
  }

  let steps = 5u32;
  let current_volume = get_session_volume(volume)?;
  for step in 1..=steps {
    if stop.load(Ordering::SeqCst) {
      break;
    }

    let progress = step as f32 / steps as f32;
    let next_volume = current_volume + (original_volume - current_volume) * progress;
    set_session_volume(volume, next_volume)?;
    thread::sleep(duration / steps);
  }

  Ok(())
}

fn get_session_volume(volume: &ISimpleAudioVolume) -> Result<f32, String> {
  unsafe { volume.GetMasterVolume() }
    .map_err(|error| format!("ISimpleAudioVolume::GetMasterVolume failed: {error}"))
}

fn set_session_volume(volume: &ISimpleAudioVolume, next_volume: f32) -> Result<(), String> {
  unsafe { volume.SetMasterVolume(next_volume.clamp(0.0, 1.0), std::ptr::null()) }
    .map_err(|error| format!("ISimpleAudioVolume::SetMasterVolume failed: {error}"))
}

fn list_targets_once() -> Result<Vec<AutoMixingTarget>, String> {
  let _com = ComGuard::new()?;
  let processes = enumerate_running_processes()?;
  let process_names = processes_by_id(&processes);
  let (_, sessions) = enumerate_default_output_sessions(&process_names)?;

  let mut targets: BTreeMap<String, AutoMixingTarget> = BTreeMap::new();

  for process in processes {
    targets
      .entry(process.executable_name.clone())
      .or_insert(AutoMixingTarget {
        executable_name: process.executable_name.clone(),
        display_name: process.display_name.clone(),
        process_id: Some(process.process_id),
        has_audio_session: false,
        is_running: true,
      });
  }

  for session in sessions {
    let entry = targets
      .entry(session.executable_name.clone())
      .or_insert(AutoMixingTarget {
        executable_name: session.executable_name.clone(),
        display_name: session.display_name.clone(),
        process_id: Some(session.process_id),
        has_audio_session: true,
        is_running: true,
      });

    entry.has_audio_session = true;
    if entry.process_id.is_none() {
      entry.process_id = Some(session.process_id);
    }
    if entry.display_name.is_empty() {
      entry.display_name = session.display_name.clone();
    }
  }

  let mut targets = targets.into_values().collect::<Vec<_>>();
  targets.sort_by(|left, right| {
    right
      .has_audio_session
      .cmp(&left.has_audio_session)
      .then_with(|| left.display_name.cmp(&right.display_name))
      .then_with(|| left.executable_name.cmp(&right.executable_name))
  });
  Ok(targets)
}

fn processes_by_id(processes: &[ProcessSnapshot]) -> BTreeMap<u32, ProcessSnapshot> {
  processes
    .iter()
    .cloned()
    .map(|process| (process.process_id, process))
    .collect()
}

fn enumerate_running_processes() -> Result<Vec<ProcessSnapshot>, String> {
  let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }
    .map_err(|error| format!("CreateToolhelp32Snapshot failed: {error}"))?;

  let mut entry = PROCESSENTRY32W::default();
  entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

  let mut processes = BTreeMap::new();
  let first = unsafe { Process32FirstW(snapshot, &mut entry) }.is_ok();
  if !first {
    unsafe {
      let _ = CloseHandle(snapshot);
    }
    return Ok(Vec::new());
  }

  loop {
    let executable_name = wide_array_to_string(&entry.szExeFile);
    if !executable_name.is_empty() && executable_name.to_ascii_lowercase().ends_with(".exe") {
      let executable_key = executable_name.to_ascii_lowercase();
      processes.entry(executable_key).or_insert(ProcessSnapshot {
        display_name: display_name_from_executable(&executable_name),
        executable_name: executable_name.to_ascii_lowercase(),
        process_id: entry.th32ProcessID,
      });
    }

    if !unsafe { Process32NextW(snapshot, &mut entry) }.is_ok() {
      break;
    }
  }

  unsafe {
    let _ = CloseHandle(snapshot);
  }

  Ok(processes.into_values().collect())
}

fn enumerate_default_output_sessions(
  processes_by_id: &BTreeMap<u32, ProcessSnapshot>,
) -> Result<(String, Vec<SessionSnapshot>), String> {
  let enumerator: IMMDeviceEnumerator =
    unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
      .map_err(|error| format!("MMDeviceEnumerator creation failed: {error}"))?;
  let device = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) }
    .map_err(|error| format!("GetDefaultAudioEndpoint failed: {error}"))?;
  let device_id = get_device_id(&device)?;
  let session_manager: IAudioSessionManager2 =
    unsafe { device.Activate(CLSCTX_ALL, None) }
      .map_err(|error| format!("IAudioSessionManager2 activation failed: {error}"))?;
  let session_enumerator = unsafe { session_manager.GetSessionEnumerator() }
    .map_err(|error| format!("GetSessionEnumerator failed: {error}"))?;
  let count = unsafe { session_enumerator.GetCount() }
    .map_err(|error| format!("IAudioSessionEnumerator::GetCount failed: {error}"))?;

  let mut sessions = Vec::new();
  for index in 0..count {
    if let Some(session) =
      enumerate_session_at(&session_enumerator, index, processes_by_id)?
    {
      sessions.push(session);
    }
  }

  Ok((device_id, sessions))
}

fn enumerate_session_at(
  session_enumerator: &IAudioSessionEnumerator,
  index: i32,
  processes_by_id: &BTreeMap<u32, ProcessSnapshot>,
) -> Result<Option<SessionSnapshot>, String> {
  let control: IAudioSessionControl = unsafe { session_enumerator.GetSession(index) }
    .map_err(|error| format!("IAudioSessionEnumerator::GetSession failed: {error}"))?;
  let control2: IAudioSessionControl2 = control
    .cast()
    .map_err(|error| format!("IAudioSessionControl2 cast failed: {error}"))?;
  let process_id = unsafe { control2.GetProcessId() }
    .map_err(|error| format!("IAudioSessionControl2::GetProcessId failed: {error}"))?;

  if process_id == 0 {
    return Ok(None);
  }

  let session_key = read_pwstr(unsafe { control2.GetSessionIdentifier() })
    .unwrap_or_else(|| format!("pid:{process_id}:{index}"));
  let executable_name = processes_by_id
    .get(&process_id)
    .map(|process| process.executable_name.clone())
    .unwrap_or_default();
  if executable_name.is_empty() {
    return Ok(None);
  }

  let display_name =
    read_pwstr(unsafe { control.GetDisplayName() })
      .filter(|value| !value.is_empty())
      .unwrap_or_else(|| display_name_from_executable(&executable_name));
  let state = unsafe { control.GetState() }
    .map_err(|error| format!("IAudioSessionControl::GetState failed: {error}"))?;
  let volume: ISimpleAudioVolume = control
    .cast()
    .map_err(|error| format!("ISimpleAudioVolume cast failed: {error}"))?;
  let current_volume = get_session_volume(&volume)?;

  Ok(Some(SessionSnapshot {
    session_key,
    executable_name: executable_name.to_ascii_lowercase(),
    display_name,
    process_id,
    active: state == AudioSessionStateActive,
    volume,
    current_volume,
  }))
}

fn get_device_id(device: &IMMDevice) -> Result<String, String> {
  read_pwstr(unsafe { device.GetId() }).ok_or_else(|| "IMMDevice::GetId returned empty".into())
}

fn read_pwstr(value: windows::core::Result<PWSTR>) -> Option<String> {
  let raw = value.ok()?;
  if raw.is_null() {
    return None;
  }

  let next = unsafe { raw.to_string() }.ok();
  unsafe {
    CoTaskMemFree(Some(raw.0 as _));
  }
  next
}

fn wide_array_to_string(buffer: &[u16]) -> String {
  let length = buffer.iter().position(|value| *value == 0).unwrap_or(buffer.len());
  String::from_utf16_lossy(&buffer[..length])
}

fn display_name_from_executable(executable_name: &str) -> String {
  executable_name.trim_end_matches(".exe").to_string()
}

fn now_isoish() -> String {
  chrono::Utc::now().to_rfc3339()
}

fn sleep_until_stop(stop: &AtomicBool, duration: Duration) -> bool {
  let started = Instant::now();
  while !stop.load(Ordering::SeqCst) && started.elapsed() < duration {
    thread::sleep(Duration::from_millis(25));
  }
  stop.load(Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
  use super::{
    compute_active_trigger_executables_from_iter, sanitize_executables, should_duck_session,
    user_changed_ducked_volume, AutoMixingRequest, WorkerConfig,
    DEFAULT_DUCKED_VOLUME_PERCENT, DEFAULT_RESTORE_DURATION_MS,
  };
  use std::{collections::BTreeSet, time::Duration};

  #[test]
  fn worker_config_sanitizes_lists_and_defaults() {
    let config = WorkerConfig::from_request(AutoMixingRequest {
      enabled: true,
      selected_executables: vec!["Spotify.exe".into(), "bad".into(), "Discord.exe".into()],
      blocked_executables: vec!["discord.exe".into()],
      ducked_volume_percent: None,
      restore_duration_ms: None,
    });

    assert!(config.selected_executables.contains("spotify.exe"));
    assert!(!config.selected_executables.contains("discord.exe"));
    assert!(config.blocked_executables.contains("discord.exe"));
    assert_eq!(config.ducked_volume, f32::from(DEFAULT_DUCKED_VOLUME_PERCENT) / 100.0);
    assert_eq!(config.restore_duration, Duration::from_millis(DEFAULT_RESTORE_DURATION_MS));
  }

  #[test]
  fn sanitize_executables_filters_invalid_entries() {
    let executables = sanitize_executables(&[
      "Spotify.exe".into(),
      " spotify.exe ".into(),
      "Discord".into(),
      "".into(),
    ]);

    assert_eq!(executables.len(), 1);
    assert!(executables.contains("spotify.exe"));
  }

  #[test]
  fn blocked_apps_do_not_trigger_ducking() {
    let active_triggers =
      BTreeSet::from(["discord.exe".to_string(), "zoom.exe".to_string()]);
    let selected = BTreeSet::from(["spotify.exe".to_string()]);
    let blocked = BTreeSet::from(["discord.exe".to_string()]);

    assert!(should_duck_session("spotify.exe", &active_triggers, &selected, &blocked));
    assert!(!should_duck_session("discord.exe", &active_triggers, &selected, &blocked));
  }

  #[test]
  fn active_trigger_executables_ignore_blocked_sessions() {
    let blocked = BTreeSet::from(["discord.exe".to_string()]);

    let triggers = compute_active_trigger_executables_from_iter(
      [("discord.exe", true), ("zoom.exe", true)],
      &blocked,
    );
    assert!(!triggers.contains("discord.exe"));
    assert!(triggers.contains("zoom.exe"));
  }

  #[test]
  fn manual_volume_change_is_detected() {
    assert!(user_changed_ducked_volume(0.8, 0.15, 0.42));
    assert!(!user_changed_ducked_volume(0.8, 0.15, 0.15));
  }
}
