#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
  fs,
  path::PathBuf,
  sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
  },
};
use tauri::{
  image::Image,
  menu::{MenuBuilder, MenuEvent, MenuItemBuilder},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, RunEvent, Window,
  WindowEvent,
};

const WINDOW_LABEL: &str = "main";
const TRAY_ID: &str = "main-tray";
const MENU_OPEN_ID: &str = "tray-open";
const MENU_SETTINGS_ID: &str = "tray-settings";
const MENU_EXIT_ID: &str = "tray-exit";
const NAVIGATE_EVENT: &str = "shell:navigate";
const WINDOW_STATE_FILE: &str = "window-state.json";
const WINDOW_STATE_VERSION: u32 = 2;
const EDGE_PADDING: i32 = 12;
const SHELL_WIDTH: u32 = 455;
const SHELL_HEIGHT: u32 = 660;

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
enum ShellView {
  Home,
  Settings,
}

#[derive(Clone, Copy, Serialize)]
struct NavigationPayload {
  view: ShellView,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
struct SavedWindowPosition {
  version: u32,
  x: i32,
  y: i32,
  width: u32,
  height: u32,
}

struct AppState {
  allow_exit: AtomicBool,
  saved_position: Mutex<Option<SavedWindowPosition>>,
}

impl Default for AppState {
  fn default() -> Self {
    Self {
      allow_exit: AtomicBool::new(false),
      saved_position: Mutex::new(None),
    }
  }
}

fn main() {
  tauri::Builder::default()
    .manage(AppState::default())
    .setup(|app| {
      let tray_menu = build_tray_menu(app.handle())?;
      let tray_icon = app
        .default_window_icon()
        .cloned()
        .map(Image::to_owned)
        .or_else(load_tray_icon)
        .ok_or_else(|| tauri::Error::AssetNotFound("default tray icon".into()))?;

      TrayIconBuilder::with_id(TRAY_ID)
        .icon(tray_icon)
        .tooltip("SHIT VAULT")
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
          handle_menu_event(app, &event);
        })
        .on_tray_icon_event(|tray, event| {
          handle_tray_icon_event(tray.app_handle(), event);
        })
        .build(app)?;

      if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        configure_window(&window)?;
        let _ = window.hide();
      }

      let initial_position = load_saved_window_position(app.handle());
      if let Ok(mut saved_position) = app.state::<AppState>().saved_position.lock() {
        *saved_position = initial_position;
      }

      Ok(())
    })
    .on_window_event(|window, event| {
      handle_window_event(window, event);
    })
    .build(tauri::generate_context!())
    .expect("error while running SHIT VAULT")
    .run(|app, event| {
      if let RunEvent::ExitRequested { api, .. } = event {
        let state = app.state::<AppState>();
        if !state.allow_exit.load(Ordering::SeqCst) {
          api.prevent_exit();
        }
      }
    });
}

fn build_tray_menu<R: tauri::Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
  MenuBuilder::new(app)
    .item(&MenuItemBuilder::with_id(MENU_OPEN_ID, "打开").build(app)?)
    .item(&MenuItemBuilder::with_id(MENU_SETTINGS_ID, "设置").build(app)?)
    .separator()
    .item(&MenuItemBuilder::with_id(MENU_EXIT_ID, "退出").build(app)?)
    .build()
}

fn load_tray_icon() -> Option<Image<'static>> {
  Image::from_path("src-tauri/icons/icon.ico").ok()
}

fn handle_menu_event<R: tauri::Runtime>(app: &AppHandle<R>, event: &MenuEvent) {
  match event.id().as_ref() {
    MENU_OPEN_ID => {
      let _ = show_shell(app, ShellView::Home, None, true);
    }
    MENU_SETTINGS_ID => {
      let _ = show_shell(app, ShellView::Settings, None, true);
    }
    MENU_EXIT_ID => {
      request_exit(app);
    }
    _ => {}
  }
}

fn handle_tray_icon_event<R: tauri::Runtime>(app: &AppHandle<R>, event: TrayIconEvent) {
  if let TrayIconEvent::Click {
    position,
    button: MouseButton::Left,
    button_state: MouseButtonState::Down,
    ..
  } = event
  {
    let _ = show_shell(
      app,
      ShellView::Home,
      Some(PhysicalPosition::new(position.x as i32, position.y as i32)),
      true,
    );
  }
}

fn handle_window_event<R: tauri::Runtime>(window: &Window<R>, event: &WindowEvent) {
  let app = window.app_handle();
  let state = app.state::<AppState>();

  match event {
    WindowEvent::CloseRequested { api, .. } => {
      if state.allow_exit.load(Ordering::SeqCst) {
        return;
      }

      api.prevent_close();
      let _ = persist_window_position(window);
      let _ = window.hide();
    }
    WindowEvent::Moved(position) => {
      if let Ok(mut saved_position) = state.saved_position.lock() {
        *saved_position = Some(SavedWindowPosition {
          x: position.x,
          y: position.y,
          version: WINDOW_STATE_VERSION,
          width: SHELL_WIDTH,
          height: SHELL_HEIGHT,
        });
      }
    }
    WindowEvent::Focused(false) => {
      let _ = persist_window_position(window);
      let _ = window.hide();
    }
    _ => {}
  }
}

fn show_shell<R: tauri::Runtime>(
  app: &AppHandle<R>,
  view: ShellView,
  anchor: Option<PhysicalPosition<i32>>,
  force_corner: bool,
) -> tauri::Result<()> {
  if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
    let state = app.state::<AppState>();
    apply_window_position(app, &window, &state, anchor, force_corner)?;
    let _ = window.emit("shell:will-show", ());
    window.show()?;
    window.set_focus()?;
    let _ = window.emit(NAVIGATE_EVENT, NavigationPayload { view });
  }

  Ok(())
}

fn configure_window<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) -> tauri::Result<()> {
  window.set_skip_taskbar(true)?;
  window.set_decorations(false)?;
  window.set_always_on_top(true)?;
  Ok(())
}

fn apply_window_position<R: tauri::Runtime>(
  app: &AppHandle<R>,
  window: &tauri::WebviewWindow<R>,
  state: &tauri::State<'_, AppState>,
  anchor: Option<PhysicalPosition<i32>>,
  force_corner: bool,
) -> tauri::Result<()> {
  let saved = state.saved_position.lock().ok().and_then(|guard| *guard);

  let position = if !force_corner {
    if let Some(saved) = saved {
      PhysicalPosition::new(saved.x, saved.y)
    } else {
      calculate_initial_position(app, window, anchor)?
    }
  } else {
    calculate_initial_position(app, window, anchor)?
  };

  window.set_position(Position::Physical(position))?;
  Ok(())
}

fn calculate_initial_position<R: tauri::Runtime>(
  app: &AppHandle<R>,
  window: &tauri::WebviewWindow<R>,
  anchor: Option<PhysicalPosition<i32>>,
) -> tauri::Result<PhysicalPosition<i32>> {
  let anchor = anchor.or_else(|| app.cursor_position().ok().map(|position| {
    PhysicalPosition::new(position.x.round() as i32, position.y.round() as i32)
  }));
  let monitor = if let Some(anchor) = anchor {
    window
      .monitor_from_point(f64::from(anchor.x), f64::from(anchor.y))?
      .or_else(|| window.primary_monitor().ok().flatten())
  } else {
    window.primary_monitor().ok().flatten()
  };
  let size = PhysicalSize::new(SHELL_WIDTH, SHELL_HEIGHT);

  if let Some(monitor) = monitor {
    let work_area = monitor.work_area();
    let x = work_area.position.x + work_area.size.width as i32 - size.width as i32 - EDGE_PADDING;
    let y =
      work_area.position.y + work_area.size.height as i32 - size.height as i32 - EDGE_PADDING;

    return Ok(PhysicalPosition::new(x.max(work_area.position.x), y.max(work_area.position.y)));
  }

  Ok(PhysicalPosition::new(160, 80))
}

fn persist_window_position<R: tauri::Runtime>(window: &Window<R>) -> tauri::Result<()> {
  let app = window.app_handle();
  let position = window.outer_position()?;
  let next = SavedWindowPosition {
    version: WINDOW_STATE_VERSION,
    x: position.x,
    y: position.y,
    width: SHELL_WIDTH,
    height: SHELL_HEIGHT,
  };

  if let Ok(mut saved_position) = app.state::<AppState>().saved_position.lock() {
    *saved_position = Some(next);
  }

  let path = window_state_path(&app)?;
  if let Some(parent) = path.parent() {
    let _ = fs::create_dir_all(parent);
  }
  let content = serde_json::to_vec(&next)?;
  fs::write(path, content)?;
  Ok(())
}

fn load_saved_window_position<R: tauri::Runtime>(
  app: &AppHandle<R>,
) -> Option<SavedWindowPosition> {
  let path = window_state_path(app).ok()?;
  let content = fs::read(path).ok()?;
  let saved: SavedWindowPosition = serde_json::from_slice(&content).ok()?;
  if saved.version != WINDOW_STATE_VERSION
    || saved.width != SHELL_WIDTH
    || saved.height != SHELL_HEIGHT
  {
    return None;
  }
  Some(saved)
}

fn window_state_path<R: tauri::Runtime>(app: &AppHandle<R>) -> tauri::Result<PathBuf> {
  Ok(app.path().app_data_dir()?.join(WINDOW_STATE_FILE))
}

fn request_exit<R: tauri::Runtime>(app: &AppHandle<R>) {
  app.state::<AppState>()
    .allow_exit
    .store(true, Ordering::SeqCst);
  app.exit(0);
}
