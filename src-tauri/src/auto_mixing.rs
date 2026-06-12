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
      eCommunications,
      eMultimedia,
      eRender,
      Endpoints::IAudioMeterInformation,
      AudioSessionStateActive,
      IAudioSessionControl,
      IAudioSessionControl2,
      IAudioSessionEnumerator,
      IAudioSessionManager2,
      IMMDevice,
      IMMDeviceEnumerator,
      ISimpleAudioVolume,
      MMDeviceEnumerator,
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
const AUDIBLE_PEAK_THRESHOLD: f32 = 0.001;
const VOLUME_EPSILON: f32 = 0.02;
const MANUAL_OVERRIDE_EPSILON: f32 = 0.04;
const DEFAULT_INCLUDE_SYSTEM_SOUNDS: bool = true;
const SYSTEM_SOUNDS_EXECUTABLE: &str = "__system_sounds__";
const SYSTEM_SOUNDS_DISPLAY_NAME: &str = "System Sounds";

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
  include_system_sounds: Option<bool>,
  ducked_volume_percent: Option<u8>,
  restore_duration_ms: Option<u64>,
  attack_duration_ms: Option<u64>,
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
  audible: bool,
  peak_value: f32,
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
  include_system_sounds: bool,
  ducked_volume: f32,
  attack_duration: Duration,
  restore_duration: Duration,
}

#[derive(Clone)]
struct SessionSnapshot {
  session_key: String,
  executable_name: String,
  display_name: String,
  process_id: u32,
  is_system_session: bool,
  active: bool,
  audible: bool,
  peak_value: f32,
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
struct DeviceSessionsSnapshot {
  device_ids: BTreeSet<String>,
  sessions: Vec<SessionSnapshot>,
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
    if config.anchor_executables.is_empty() {
      return Err("auto mixing requires at least one duck target".into());
    }
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
      include_system_sounds: request
        .include_system_sounds
        .unwrap_or(DEFAULT_INCLUDE_SYSTEM_SOUNDS),
      ducked_volume: f32::from(
        request
          .ducked_volume_percent
          .unwrap_or(DEFAULT_DUCKED_VOLUME_PERCENT)
          .min(MAX_DUCKED_VOLUME_PERCENT),
      ) / 100.0,
      attack_duration: Duration::from_millis(
        normalize_attack_duration_ms(request.attack_duration_ms),
      ),
      restore_duration: Duration::from_millis(
        normalize_restore_duration_ms(request.restore_duration_ms),
      ),
    }
  }
}

fn normalize_attack_duration_ms(value: Option<u64>) -> u64 {
  value
    .unwrap_or(DEFAULT_ATTACK_DURATION_MS)
    .clamp(MIN_RESTORE_DURATION_MS, MAX_RESTORE_DURATION_MS)
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
  let mut current_device_ids = BTreeSet::new();

  loop {
    if stop.load(Ordering::SeqCst) {
      restore_all_sessions(&mut tracked_sessions, config.restore_duration, &stop);
      break;
    }

    match enumerate_running_processes()
      .map(|processes| processes_by_id(&processes))
      .and_then(|processes| enumerate_monitored_output_sessions(&processes, true))
    {
      Ok(snapshot) => {
        if current_device_ids != snapshot.device_ids {
          restore_all_sessions(&mut tracked_sessions, config.restore_duration, &stop);
          current_device_ids = snapshot.device_ids.clone();
        }

        runtime.write_runtime_error(None);
        runtime.write_observed_session_count(snapshot.sessions.len());
        apply_ducking_round(&config, &snapshot.sessions, &mut tracked_sessions, &stop);
        runtime.write_diagnostics(build_runtime_diagnostics(&snapshot.sessions, &tracked_sessions));
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
  let audible_trigger_executables = compute_audible_trigger_executables(
    sessions,
    &config.anchor_executables,
    &config.excluded_executables,
    config.include_system_sounds,
  );
  let active_sessions: BTreeMap<&str, &SessionSnapshot> = sessions
    .iter()
    .map(|session| (session.session_key.as_str(), session))
    .collect();

  for session in sessions {
    let should_duck = should_duck_session(
      &session.executable_name,
      session.active,
      &audible_trigger_executables,
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
            config.attack_duration,
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
              config.attack_duration,
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
      &audible_trigger_executables,
      &config.anchor_executables,
      &config.excluded_executables,
    );

    if still_anchor && !still_excluded && should_remain_ducked {
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
    ) && !tracked.manual_override {
      tracked.manual_override = true;
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
        process_id: (session.process_id != 0).then_some(session.process_id),
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
    process_id: (session.process_id != 0).then_some(session.process_id),
    active: session.active,
    audible: session.audible,
    peak_value: session.peak_value,
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

  for (_manual_override, volume, original_volume) in sessions {
    let _ = restore_session_volume(&volume, original_volume, restore_duration, stop);
  }
}

fn compute_audible_trigger_executables(
  sessions: &[SessionSnapshot],
  anchor_executables: &BTreeSet<String>,
  excluded_executables: &BTreeSet<String>,
  include_system_sounds: bool,
) -> BTreeSet<String> {
  compute_audible_trigger_executables_from_iter(
    sessions
      .iter()
      .map(|session| (session.executable_name.as_str(), session.audible)),
    anchor_executables,
    excluded_executables,
    include_system_sounds,
  )
}

fn compute_audible_trigger_executables_from_iter<'a>(
  sessions: impl IntoIterator<Item = (&'a str, bool)>,
  anchor_executables: &BTreeSet<String>,
  excluded_executables: &BTreeSet<String>,
  include_system_sounds: bool,
) -> BTreeSet<String> {
  sessions
    .into_iter()
    .filter(|(executable_name, audible)| {
      let executable_name = executable_name.to_ascii_lowercase();
      *audible
        && (include_system_sounds || executable_name != SYSTEM_SOUNDS_EXECUTABLE)
        && !anchor_executables.contains(&executable_name)
        && !excluded_executables.contains(&executable_name)
    })
    .map(|(executable_name, _)| executable_name.to_ascii_lowercase())
    .collect()
}

fn should_duck_session(
  executable_name: &str,
  session_active: bool,
  audible_trigger_executables: &BTreeSet<String>,
  anchor_executables: &BTreeSet<String>,
  excluded_executables: &BTreeSet<String>,
) -> bool {
  session_active
    && !audible_trigger_executables.is_empty()
    && anchor_executables.contains(executable_name)
    && !excluded_executables.contains(executable_name)
}

fn is_session_audible(session_active: bool, peak_value: f32) -> bool {
  session_active && peak_value >= AUDIBLE_PEAK_THRESHOLD
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

fn get_session_peak_value(meter: &IAudioMeterInformation) -> Result<f32, String> {
  unsafe { meter.GetPeakValue() }
    .map_err(|error| format!("IAudioMeterInformation::GetPeakValue failed: {error}"))
}

fn set_session_volume(volume: &ISimpleAudioVolume, next_volume: f32) -> Result<(), String> {
  unsafe { volume.SetMasterVolume(next_volume.clamp(0.0, 1.0), std::ptr::null()) }
    .map_err(|error| format!("ISimpleAudioVolume::SetMasterVolume failed: {error}"))
}

fn list_targets_once() -> Result<Vec<AutoMixingTarget>, String> {
  let _com = ComGuard::new()?;
  let processes = enumerate_running_processes()?;
  let process_names = processes_by_id(&processes);
  let snapshot = enumerate_monitored_output_sessions(&process_names, false)?;

  let mut targets: BTreeMap<String, AutoMixingTarget> = BTreeMap::new();

  for session in snapshot
    .sessions
    .into_iter()
    .filter(|session| !session.is_system_session)
  {
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
  let snapshot = enumerate_monitored_output_sessions(&process_names, true)?;

  Ok(AutoMixingDiagnostics {
    current_sessions: snapshot
      .sessions
      .iter()
      .map(session_to_diagnostic_session)
      .collect(),
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

fn enumerate_monitored_output_sessions(
  processes_by_id: &BTreeMap<u32, ProcessSnapshot>,
  include_system_sessions: bool,
) -> Result<DeviceSessionsSnapshot, String> {
  let enumerator: IMMDeviceEnumerator =
    unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
      .map_err(|error| format!("MMDeviceEnumerator creation failed: {error}"))?;
  let mut device_ids = BTreeSet::new();
  let mut devices = Vec::new();
  let mut last_error = None;

  for role in [eMultimedia, eCommunications] {
    match unsafe { enumerator.GetDefaultAudioEndpoint(eRender, role) } {
      Ok(device) => {
        let device_id = get_device_id(&device)?;
        if device_ids.insert(device_id.clone()) {
          devices.push((device_id, device));
        }
      }
      Err(error) => {
        last_error = Some(format!("GetDefaultAudioEndpoint failed: {error}"));
      }
    }
  }

  if devices.is_empty() {
    return Err(last_error.unwrap_or_else(|| "No default audio endpoints available".into()));
  }

  let mut sessions = Vec::new();
  for (device_id, device) in devices {
    sessions.extend(enumerate_output_sessions_for_device(
      &device_id,
      &device,
      processes_by_id,
      include_system_sessions,
    )?);
  }

  Ok(DeviceSessionsSnapshot { device_ids, sessions })
}

fn enumerate_output_sessions_for_device(
  device_id: &str,
  device: &IMMDevice,
  processes_by_id: &BTreeMap<u32, ProcessSnapshot>,
  include_system_sessions: bool,
) -> Result<Vec<SessionSnapshot>, String> {
  let session_manager: IAudioSessionManager2 =
    unsafe { device.Activate(CLSCTX_ALL, None) }
      .map_err(|error| format!("IAudioSessionManager2 activation failed: {error}"))?;
  let session_enumerator = unsafe { session_manager.GetSessionEnumerator() }
    .map_err(|error| format!("GetSessionEnumerator failed: {error}"))?;
  let count = unsafe { session_enumerator.GetCount() }
    .map_err(|error| format!("IAudioSessionEnumerator::GetCount failed: {error}"))?;

  let mut sessions = Vec::new();
  for index in 0..count {
    if let Some(session) = enumerate_session_at(
      &session_enumerator,
      index,
      device_id,
      processes_by_id,
      include_system_sessions,
    )? {
      sessions.push(session);
    }
  }

  Ok(sessions)
}

fn enumerate_session_at(
  session_enumerator: &IAudioSessionEnumerator,
  index: i32,
  device_id: &str,
  processes_by_id: &BTreeMap<u32, ProcessSnapshot>,
  include_system_sessions: bool,
) -> Result<Option<SessionSnapshot>, String> {
  let control: IAudioSessionControl = unsafe { session_enumerator.GetSession(index) }
    .map_err(|error| format!("IAudioSessionEnumerator::GetSession failed: {error}"))?;
  let control2: IAudioSessionControl2 = control
    .cast()
    .map_err(|error| format!("IAudioSessionControl2 cast failed: {error}"))?;
  let process_id = unsafe { control2.GetProcessId() }
    .map_err(|error| format!("IAudioSessionControl2::GetProcessId failed: {error}"))?;

  let raw_session_key = read_pwstr(unsafe { control2.GetSessionIdentifier() })
    .unwrap_or_else(|| format!("pid:{process_id}:{index}"));
  let session_key = format!("{device_id}:{raw_session_key}");
  let is_system_session = process_id == 0;
  if is_system_session && !include_system_sessions {
    return Ok(None);
  }

  let executable_name = if is_system_session {
    SYSTEM_SOUNDS_EXECUTABLE.to_string()
  } else {
    processes_by_id
      .get(&process_id)
      .map(|process| process.executable_name.clone())
      .unwrap_or_default()
  };
  if executable_name.is_empty() {
    return Ok(None);
  }

  let display_name = if is_system_session {
    SYSTEM_SOUNDS_DISPLAY_NAME.to_string()
  } else {
    read_pwstr(unsafe { control.GetDisplayName() })
      .filter(|value| !value.is_empty())
      .unwrap_or_else(|| display_name_from_executable(&executable_name))
  };
  let state = unsafe { control.GetState() }
    .map_err(|error| format!("IAudioSessionControl::GetState failed: {error}"))?;
  let active = state == AudioSessionStateActive;
  let volume: ISimpleAudioVolume = control
    .cast()
    .map_err(|error| format!("ISimpleAudioVolume cast failed: {error}"))?;
  let meter: IAudioMeterInformation = control
    .cast()
    .map_err(|error| format!("IAudioMeterInformation cast failed: {error}"))?;
  let current_volume = get_session_volume(&volume)?;
  let peak_value = get_session_peak_value(&meter)?;

  Ok(Some(SessionSnapshot {
    session_key,
    executable_name: executable_name.to_ascii_lowercase(),
    display_name,
    process_id,
    is_system_session,
    active,
    audible: is_session_audible(active, peak_value),
    peak_value,
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
    advance_envelope_volume, compute_audible_trigger_executables_from_iter,
    envelope_coefficient, is_session_audible, normalize_attack_duration_ms,
    normalize_restore_duration_ms, processes_by_id, sanitize_executables, should_duck_session,
    user_changed_ducked_volume, AutoMixingRequest, ProcessSnapshot, WorkerConfig,
    AUDIBLE_PEAK_THRESHOLD, DEFAULT_ATTACK_DURATION_MS, DEFAULT_DUCKED_VOLUME_PERCENT,
    DEFAULT_RESTORE_DURATION_MS,
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
      include_system_sounds: None,
      ducked_volume_percent: None,
      restore_duration_ms: None,
      attack_duration_ms: None,
    });

    assert!(config.anchor_executables.contains("spotify.exe"));
    assert!(!config.anchor_executables.contains("discord.exe"));
    assert!(config.excluded_executables.contains("discord.exe"));
    assert_eq!(config.ducked_volume, f32::from(DEFAULT_DUCKED_VOLUME_PERCENT) / 100.0);
    assert_eq!(config.attack_duration, Duration::from_millis(DEFAULT_ATTACK_DURATION_MS));
    assert_eq!(config.restore_duration, Duration::from_millis(DEFAULT_RESTORE_DURATION_MS));
  }

  #[test]
  fn worker_config_accepts_user_tuned_envelope_values() {
    let config = WorkerConfig::from_request(AutoMixingRequest {
      enabled: true,
      selected_executables: Vec::new(),
      blocked_executables: Vec::new(),
      anchor_executables: vec!["Spotify.exe".into()],
      excluded_executables: Vec::new(),
      include_system_sounds: Some(false),
      ducked_volume_percent: Some(40),
      restore_duration_ms: Some(600),
      attack_duration_ms: Some(600),
    });

    assert_eq!(config.ducked_volume, 0.4);
    assert_eq!(config.attack_duration, Duration::from_millis(600));
    assert_eq!(config.restore_duration, Duration::from_millis(600));
    assert!(!config.include_system_sounds);
  }

  #[test]
  fn attack_duration_defaults_to_legacy_fast_attack() {
    assert_eq!(normalize_attack_duration_ms(None), DEFAULT_ATTACK_DURATION_MS);
    assert_eq!(normalize_attack_duration_ms(Some(0)), 0);
    assert_eq!(normalize_attack_duration_ms(Some(20_000)), 10_000);
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
  fn audible_other_sessions_duck_selected_bgm_sessions() {
    let audible_triggers = BTreeSet::from(["chrome.exe".to_string()]);
    let selected = BTreeSet::from(["spotify.exe".to_string()]);
    let blocked = BTreeSet::from(["discord.exe".to_string()]);

    assert!(should_duck_session("spotify.exe", true, &audible_triggers, &selected, &blocked));
    assert!(!should_duck_session("chrome.exe", true, &audible_triggers, &selected, &blocked));
    assert!(!should_duck_session("discord.exe", true, &audible_triggers, &selected, &blocked));
    assert!(!should_duck_session("spotify.exe", false, &audible_triggers, &selected, &blocked));
  }

  #[test]
  fn audible_trigger_executables_ignore_selected_and_excluded_sessions() {
    let selected = BTreeSet::from(["spotify.exe".to_string(), "qqmusic.exe".to_string()]);
    let blocked = BTreeSet::from(["discord.exe".to_string()]);

    let triggers = compute_audible_trigger_executables_from_iter(
      [
        ("spotify.exe", true),
        ("qqmusic.exe", false),
        ("chrome.exe", true),
        ("discord.exe", true),
      ],
      &selected,
      &blocked,
      true,
    );

    assert!(!triggers.contains("spotify.exe"));
    assert!(!triggers.contains("qqmusic.exe"));
    assert!(triggers.contains("chrome.exe"));
    assert!(!triggers.contains("discord.exe"));
  }

  #[test]
  fn session_audibility_requires_active_state_and_peak_above_threshold() {
    assert!(!is_session_audible(true, 0.0));
    assert!(!is_session_audible(true, AUDIBLE_PEAK_THRESHOLD / 2.0));
    assert!(!is_session_audible(false, 1.0));
    assert!(is_session_audible(true, AUDIBLE_PEAK_THRESHOLD));
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
