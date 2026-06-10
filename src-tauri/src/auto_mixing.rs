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
const DEFAULT_RESTORE_DURATION_MS: u64 = 120;
const LEGACY_DEFAULT_RESTORE_DURATION_MS: u64 = 300;
const DEFAULT_ATTACK_DURATION_MS: u64 = 35;
const RELEASE_HOLD_MS: u64 = 50;
const POLL_INTERVAL_MS: u64 = 40;
const MAX_DUCKED_VOLUME_PERCENT: u8 = 100;
const MIN_RESTORE_DURATION_MS: u64 = 0;
const MAX_RESTORE_DURATION_MS: u64 = 10_000;
const VOLUME_EPSILON: f32 = 0.02;
const MANUAL_OVERRIDE_EPSILON: f32 = 0.04;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoMixingRequest {
  enabled: bool,
  #[serde(default)]
  selected_executables: Vec<String>,
  #[serde(default)]
  blocked_executables: Vec<String>,
  #[serde(default)]
  anchor_executables: Vec<String>,
  #[serde(default)]
  excluded_executables: Vec<String>,
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

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoMixingDiagnostics {
  current_sessions: Vec<AutoMixingDiagnosticSession>,
  ducked_sessions: Vec<AutoMixingDuckedSession>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoMixingDiagnosticSession {
  session_key: String,
  executable_name: String,
  display_name: String,
  process_id: Option<u32>,
  active: bool,
  current_volume: f32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoMixingDuckedSession {
  session_key: String,
  executable_name: String,
  display_name: String,
  process_id: Option<u32>,
  current_volume: f32,
  original_volume: f32,
  expected_ducked_volume: f32,
  manual_override: bool,
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
  diagnostics: Mutex<AutoMixingDiagnostics>,
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

  fn write_diagnostics(&self, value: AutoMixingDiagnostics) {
    if let Ok(mut diagnostics) = self.diagnostics.lock() {
      *diagnostics = value;
    }
  }

  fn clear_diagnostics(&self) {
    self.write_diagnostics(AutoMixingDiagnostics::default());
  }

  fn diagnostics(&self) -> AutoMixingDiagnostics {
    self
      .diagnostics
      .lock()
      .map(|diagnostics| diagnostics.clone())
      .unwrap_or_default()
  }
}

struct AutoMixingWorker {
  stop: Arc<AtomicBool>,
  handle: JoinHandle<()>,
}

#[derive(Clone)]
struct WorkerConfig {
  anchor_executables: BTreeSet<String>,
  excluded_executables: BTreeSet<String>,
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
  last_applied_volume: f32,
  release_started_at: Option<Instant>,
  manual_override: bool,
}

#[derive(Clone)]
struct ProcessSnapshot {
  executable_name: String,
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

  pub fn diagnostics(&self) -> Result<AutoMixingDiagnostics, String> {
    let ducked_sessions = self.runtime.diagnostics().ducked_sessions;
    let handle = thread::Builder::new()
      .name("auto-mixing-diagnostics".into())
      .spawn(move || diagnostics_once(ducked_sessions))
      .map_err(|error| format!("auto mixing diagnostics failed to start: {error}"))?;

    handle
      .join()
      .map_err(|_| "auto mixing diagnostics panicked".to_string())?
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
    self.runtime.clear_diagnostics();
  }

  fn start(&self, request: AutoMixingRequest) -> Result<(), String> {
    self.stop();
    self.runtime.write_runtime_error(None);
    self.runtime.write_active_duck_count(0);
    self.runtime.write_observed_session_count(0);
    self.runtime.clear_diagnostics();

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
    let excluded_executables =
      sanitize_executables(&merge_executable_lists(
        request.excluded_executables,
        request.blocked_executables,
      ));
    let anchor_executables =
      sanitize_executables(&merge_executable_lists(
        request.anchor_executables,
        request.selected_executables,
      ))
        .into_iter()
        .filter(|executable| !excluded_executables.contains(executable))
        .collect();

    Self {
      anchor_executables,
      excluded_executables,
      ducked_volume: f32::from(
        request
          .ducked_volume_percent
          .unwrap_or(DEFAULT_DUCKED_VOLUME_PERCENT)
          .min(MAX_DUCKED_VOLUME_PERCENT),
      ) / 100.0,
      restore_duration: Duration::from_millis(
        normalize_restore_duration_ms(request.restore_duration_ms),
      ),
    }
  }
}

fn normalize_restore_duration_ms(value: Option<u64>) -> u64 {
  let duration = value.unwrap_or(DEFAULT_RESTORE_DURATION_MS);
  if duration == LEGACY_DEFAULT_RESTORE_DURATION_MS {
    return DEFAULT_RESTORE_DURATION_MS;
  }

  duration.clamp(MIN_RESTORE_DURATION_MS, MAX_RESTORE_DURATION_MS)
}

fn merge_executable_lists(primary: Vec<String>, legacy: Vec<String>) -> Vec<String> {
  primary.into_iter().chain(legacy).collect()
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
        runtime.write_diagnostics(build_runtime_diagnostics(&sessions, &tracked_sessions));
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
        runtime.clear_diagnostics();
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
  _stop: &AtomicBool,
) {
  let now = Instant::now();
  let active_trigger_executables = compute_active_trigger_executables(
    sessions,
    &config.anchor_executables,
    &config.excluded_executables,
  );
  let active_sessions: BTreeMap<&str, &SessionSnapshot> = sessions
    .iter()
    .map(|session| (session.session_key.as_str(), session))
    .collect();

  for session in sessions {
    let should_duck = should_duck_session(
      &session.executable_name,
      session.active,
      &active_trigger_executables,
      &config.anchor_executables,
      &config.excluded_executables,
    );

    if should_duck {
      match tracked_sessions.get_mut(&session.session_key) {
        Some(tracked) => {
          if tracked.manual_override {
            continue;
          }

          if user_changed_ducked_volume(
            tracked.original_volume,
            tracked.last_applied_volume,
            session.current_volume,
          ) {
            tracked.manual_override = true;
            continue;
          }

          tracked.release_started_at = None;
          let next_volume = advance_envelope_volume(
            session.current_volume,
            tracked.expected_ducked_volume,
            Duration::from_millis(DEFAULT_ATTACK_DURATION_MS),
          );
          if (next_volume - session.current_volume).abs() > VOLUME_EPSILON
            && set_session_volume(&tracked.volume, next_volume).is_ok()
          {
            tracked.last_applied_volume = next_volume;
          }
        }
        None => {
          let target_volume = config.ducked_volume.min(session.current_volume);
          if (session.current_volume - target_volume).abs() > VOLUME_EPSILON {
            let next_volume = advance_envelope_volume(
              session.current_volume,
              target_volume,
              Duration::from_millis(DEFAULT_ATTACK_DURATION_MS),
            );
            if set_session_volume(&session.volume, next_volume).is_ok() {
              tracked_sessions.insert(
                session.session_key.clone(),
                DuckedSession {
                  executable_name: session.executable_name.clone(),
                  original_volume: session.current_volume,
                  expected_ducked_volume: target_volume,
                  volume: session.volume.clone(),
                  last_applied_volume: next_volume,
                  release_started_at: None,
                  manual_override: false,
                },
              );
            }
          }
        }
      }
    }
  }

  let mut stale_keys = Vec::new();
  let mut released_keys = Vec::new();

  for (key, tracked) in tracked_sessions.iter_mut() {
    let Some(active_session) = active_sessions.get(key.as_str()) else {
      stale_keys.push(key.clone());
      continue;
    };

      let still_anchor = config.anchor_executables.contains(&tracked.executable_name);
      let still_excluded = config.excluded_executables.contains(&tracked.executable_name);
      let should_remain_ducked = should_duck_session(
        &tracked.executable_name,
        active_session.active,
        &active_trigger_executables,
        &config.anchor_executables,
        &config.excluded_executables,
      );

    if still_anchor && !still_excluded && should_remain_ducked {
      continue;
    }

    if tracked.manual_override {
      released_keys.push(key.clone());
      continue;
    }

    let release_started_at = *tracked.release_started_at.get_or_insert(now);
    if now.duration_since(release_started_at) < Duration::from_millis(RELEASE_HOLD_MS) {
      continue;
    }

    let current_volume = get_session_volume(&tracked.volume).unwrap_or(active_session.current_volume);
    if user_changed_ducked_volume(
      tracked.original_volume,
      tracked.last_applied_volume,
      current_volume,
    ) {
      tracked.manual_override = true;
      released_keys.push(key.clone());
      continue;
    }

    let next_volume = advance_envelope_volume(
      current_volume,
      tracked.original_volume,
      config.restore_duration,
    );
    if set_session_volume(&tracked.volume, next_volume).is_ok() {
      tracked.last_applied_volume = next_volume;
    }

    if (next_volume - tracked.original_volume).abs() <= VOLUME_EPSILON {
      let _ = set_session_volume(&tracked.volume, tracked.original_volume);
      released_keys.push(key.clone());
    }
  }

  for key in stale_keys.into_iter().chain(released_keys) {
    tracked_sessions.remove(&key);
  }
}

fn build_runtime_diagnostics(
  sessions: &[SessionSnapshot],
  tracked_sessions: &BTreeMap<String, DuckedSession>,
) -> AutoMixingDiagnostics {
  let sessions_by_key: BTreeMap<&str, &SessionSnapshot> = sessions
    .iter()
    .map(|session| (session.session_key.as_str(), session))
    .collect();
  let current_sessions = sessions
    .iter()
    .map(session_to_diagnostic_session)
    .collect::<Vec<_>>();
  let ducked_sessions = tracked_sessions
    .iter()
    .filter_map(|(session_key, tracked)| {
      let session = sessions_by_key.get(session_key.as_str())?;
      Some(AutoMixingDuckedSession {
        session_key: session.session_key.clone(),
        executable_name: session.executable_name.clone(),
        display_name: session.display_name.clone(),
        process_id: Some(session.process_id),
        current_volume: session.current_volume,
        original_volume: tracked.original_volume,
        expected_ducked_volume: tracked.expected_ducked_volume,
        manual_override: tracked.manual_override,
      })
    })
    .collect();

  AutoMixingDiagnostics {
    current_sessions,
    ducked_sessions,
  }
}

fn session_to_diagnostic_session(session: &SessionSnapshot) -> AutoMixingDiagnosticSession {
  AutoMixingDiagnosticSession {
    session_key: session.session_key.clone(),
    executable_name: session.executable_name.clone(),
    display_name: session.display_name.clone(),
    process_id: Some(session.process_id),
    active: session.active,
    current_volume: session.current_volume,
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
  anchor_executables: &BTreeSet<String>,
  excluded_executables: &BTreeSet<String>,
) -> BTreeSet<String> {
  compute_active_trigger_executables_from_iter(
    sessions
      .iter()
      .map(|session| (session.executable_name.as_str(), session.active)),
    anchor_executables,
    excluded_executables,
  )
}

fn compute_active_trigger_executables_from_iter<'a>(
  sessions: impl IntoIterator<Item = (&'a str, bool)>,
  anchor_executables: &BTreeSet<String>,
  excluded_executables: &BTreeSet<String>,
) -> BTreeSet<String> {
  sessions
    .into_iter()
    .filter(|(executable_name, active)| {
      let executable_name = executable_name.to_ascii_lowercase();
      *active
        && !anchor_executables.contains(&executable_name)
        && !excluded_executables.contains(&executable_name)
    })
    .map(|(executable_name, _)| executable_name.to_ascii_lowercase())
    .collect()
}

fn should_duck_session(
  executable_name: &str,
  session_active: bool,
  active_trigger_executables: &BTreeSet<String>,
  anchor_executables: &BTreeSet<String>,
  excluded_executables: &BTreeSet<String>,
) -> bool {
  session_active
    && !active_trigger_executables.is_empty()
    && anchor_executables.contains(executable_name)
    && !excluded_executables.contains(executable_name)
}

fn user_changed_ducked_volume(original: f32, expected: f32, current: f32) -> bool {
  (current - expected).abs() > MANUAL_OVERRIDE_EPSILON
    && (current - original).abs() > MANUAL_OVERRIDE_EPSILON
}

fn restore_session_volume(
  volume: &ISimpleAudioVolume,
  original_volume: f32,
  _duration: Duration,
  _stop: &AtomicBool,
) -> Result<(), String> {
  set_session_volume(volume, original_volume)
}

fn advance_envelope_volume(current_volume: f32, target_volume: f32, duration: Duration) -> f32 {
  let coefficient = envelope_coefficient(duration);
  (current_volume + (target_volume - current_volume) * coefficient).clamp(0.0, 1.0)
}

fn envelope_coefficient(duration: Duration) -> f32 {
  if duration.is_zero() {
    return 1.0;
  }

  let tick = Duration::from_millis(POLL_INTERVAL_MS).as_secs_f32();
  let duration = duration.as_secs_f32().max(f32::EPSILON);
  (1.0 - (-tick / duration).exp()).clamp(0.0, 1.0)
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

fn diagnostics_once(
  ducked_sessions: Vec<AutoMixingDuckedSession>,
) -> Result<AutoMixingDiagnostics, String> {
  let _com = ComGuard::new()?;
  let processes = enumerate_running_processes()?;
  let process_names = processes_by_id(&processes);
  let (_, sessions) = enumerate_default_output_sessions(&process_names)?;

  Ok(AutoMixingDiagnostics {
    current_sessions: sessions.iter().map(session_to_diagnostic_session).collect(),
    ducked_sessions,
  })
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

  let mut processes = Vec::new();
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
      processes.push(ProcessSnapshot {
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

  Ok(processes)
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
    advance_envelope_volume, compute_active_trigger_executables_from_iter, envelope_coefficient,
    normalize_restore_duration_ms, processes_by_id, sanitize_executables, should_duck_session,
    user_changed_ducked_volume, AutoMixingRequest, ProcessSnapshot, WorkerConfig,
    DEFAULT_ATTACK_DURATION_MS, DEFAULT_DUCKED_VOLUME_PERCENT, DEFAULT_RESTORE_DURATION_MS,
  };
  use std::{collections::BTreeSet, time::Duration};

  #[test]
  fn worker_config_sanitizes_lists_and_defaults() {
    let config = WorkerConfig::from_request(AutoMixingRequest {
      enabled: true,
      selected_executables: vec!["Spotify.exe".into(), "bad".into(), "Discord.exe".into()],
      blocked_executables: vec!["discord.exe".into()],
      anchor_executables: Vec::new(),
      excluded_executables: Vec::new(),
      ducked_volume_percent: None,
      restore_duration_ms: None,
    });

    assert!(config.anchor_executables.contains("spotify.exe"));
    assert!(!config.anchor_executables.contains("discord.exe"));
    assert!(config.excluded_executables.contains("discord.exe"));
    assert_eq!(config.ducked_volume, f32::from(DEFAULT_DUCKED_VOLUME_PERCENT) / 100.0);
    assert_eq!(config.restore_duration, Duration::from_millis(DEFAULT_RESTORE_DURATION_MS));
  }

  #[test]
  fn legacy_restore_duration_uses_fast_default() {
    assert_eq!(normalize_restore_duration_ms(None), DEFAULT_RESTORE_DURATION_MS);
    assert_eq!(normalize_restore_duration_ms(Some(300)), DEFAULT_RESTORE_DURATION_MS);
    assert_eq!(normalize_restore_duration_ms(Some(80)), 80);
    assert_eq!(normalize_restore_duration_ms(Some(20_000)), 10_000);
  }

  #[test]
  fn sidechain_envelope_has_fast_attack_and_smoother_release() {
    let attack = envelope_coefficient(Duration::from_millis(DEFAULT_ATTACK_DURATION_MS));
    let release = envelope_coefficient(Duration::from_millis(DEFAULT_RESTORE_DURATION_MS));

    assert!(attack > 0.65);
    assert!(attack < 0.70);
    assert!(release > 0.28);
    assert!(release < 0.29);

    let ducked = advance_envelope_volume(
      0.8,
      0.15,
      Duration::from_millis(DEFAULT_ATTACK_DURATION_MS),
    );
    let restored = advance_envelope_volume(
      0.15,
      0.8,
      Duration::from_millis(DEFAULT_RESTORE_DURATION_MS),
    );

    assert!(ducked > 0.35);
    assert!(ducked < 0.37);
    assert!(restored > 0.33);
    assert!(restored < 0.34);
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
  fn active_other_sessions_duck_selected_bgm_sessions() {
    let active_triggers = BTreeSet::from(["chrome.exe".to_string()]);
    let selected = BTreeSet::from(["spotify.exe".to_string()]);
    let blocked = BTreeSet::from(["discord.exe".to_string()]);

    assert!(should_duck_session("spotify.exe", true, &active_triggers, &selected, &blocked));
    assert!(!should_duck_session("chrome.exe", true, &active_triggers, &selected, &blocked));
    assert!(!should_duck_session("discord.exe", true, &active_triggers, &selected, &blocked));
    assert!(!should_duck_session("spotify.exe", false, &active_triggers, &selected, &blocked));
  }

  #[test]
  fn active_trigger_executables_ignore_selected_and_excluded_sessions() {
    let selected = BTreeSet::from(["spotify.exe".to_string(), "qqmusic.exe".to_string()]);
    let blocked = BTreeSet::from(["discord.exe".to_string()]);

    let triggers = compute_active_trigger_executables_from_iter(
      [
        ("spotify.exe", true),
        ("qqmusic.exe", false),
        ("chrome.exe", true),
        ("discord.exe", true),
      ],
      &selected,
      &blocked,
    );

    assert!(!triggers.contains("spotify.exe"));
    assert!(!triggers.contains("qqmusic.exe"));
    assert!(triggers.contains("chrome.exe"));
    assert!(!triggers.contains("discord.exe"));
  }

  #[test]
  fn manual_volume_change_is_detected() {
    assert!(user_changed_ducked_volume(0.8, 0.15, 0.42));
    assert!(!user_changed_ducked_volume(0.8, 0.15, 0.17));
  }

  #[test]
  fn processes_by_id_keeps_multiple_pids_for_same_executable() {
    let processes = vec![
      ProcessSnapshot {
        executable_name: "chrome.exe".into(),
        process_id: 101,
      },
      ProcessSnapshot {
        executable_name: "chrome.exe".into(),
        process_id: 202,
      },
    ];

    let mapped = processes_by_id(&processes);

    assert_eq!(mapped.len(), 2);
    assert_eq!(mapped.get(&101).map(|process| process.executable_name.as_str()), Some("chrome.exe"));
    assert_eq!(mapped.get(&202).map(|process| process.executable_name.as_str()), Some("chrome.exe"));
  }
}
