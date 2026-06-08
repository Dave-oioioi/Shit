use serde::{Deserialize, Serialize};
use std::{
  sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
  },
  thread::{self, JoinHandle},
  time::{Duration, Instant},
};
use windows_sys::Win32::{
  Foundation::GetLastError,
  System::{
    Power::{
      SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
    },
  },
};

const DEFAULT_IDLE_THRESHOLD_SECONDS: u64 = 150;
const MIN_IDLE_THRESHOLD_SECONDS: u64 = 30;
const MAX_IDLE_THRESHOLD_SECONDS: u64 = 600;
const POLL_INTERVAL_MS: u64 = 1_000;

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
    let error = self
      .runtime
      .last_error
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
  let refresh_interval = Duration::from_secs(idle_threshold_seconds.min(30));

  while !stop.load(Ordering::SeqCst) {
    if let Err(error) = apply_execution_state() {
      runtime.write_error(Some(error));
      sleep_until_stop(&stop, Duration::from_secs(10));
      continue;
    }

    runtime.write_error(None);
    runtime.write_last_pulse_at(Some(now_isoish()));
    sleep_until_stop(&stop, refresh_interval.max(Duration::from_millis(POLL_INTERVAL_MS)));
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

fn last_os_error(prefix: &str) -> String {
  let code = unsafe { GetLastError() };
  format!("{prefix}: Windows error {code}")
}

fn now_isoish() -> String {
  chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
  use super::{PreventSleepManager, PreventSleepRuntime, PreventSleepStatus};
  use std::sync::Arc;

  fn snapshot(runtime: &Arc<PreventSleepRuntime>, enabled: bool) -> PreventSleepStatus {
    PreventSleepStatus {
      enabled,
      last_pulse_at: runtime
        .last_pulse_at
        .lock()
        .ok()
        .and_then(|value| value.clone()),
      error: runtime
        .last_error
        .lock()
        .ok()
        .and_then(|value| value.clone()),
    }
  }

  #[test]
  fn status_can_represent_disabled_runtime_with_error() {
    let runtime = Arc::new(PreventSleepRuntime::default());
    runtime.write_error(Some("SetThreadExecutionState failed".into()));

    let status = snapshot(&runtime, false);

    assert!(!status.enabled);
    assert_eq!(status.error.as_deref(), Some("SetThreadExecutionState failed"));
  }

  #[test]
  fn stop_clears_stale_runtime_state() {
    let manager = PreventSleepManager::default();
    manager.runtime.write_error(Some("temporary native error".into()));
    manager.runtime.write_last_pulse_at(Some("2026-06-09T00:00:00Z".into()));

    manager.stop();

    let status = manager.status();
    assert!(!status.enabled);
    assert_eq!(status.error, None);
    assert_eq!(status.last_pulse_at, None);
  }
}
