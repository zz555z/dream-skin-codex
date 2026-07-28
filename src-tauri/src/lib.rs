mod engine;

use engine::{
    active_theme_image, apply_skin, decode_base64_payload, delete_theme, get_status,
    import_image_theme, initialize_windows_diagnostics, install_engine, list_themes,
    max_import_image_bytes, pause_skin, preview_image, resolve_theme_image_path, restore_skin,
    save_upload_bytes, set_windows_diagnostics, switch_theme, theme_preview, ActionResult,
    ImportOptions, StatusSnapshot, ThemeSummary,
};
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

struct AppState {
    busy: AtomicBool,
}

struct TemporaryUpload {
    path: PathBuf,
}

impl TemporaryUpload {
    fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }
}

impl Drop for TemporaryUpload {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

impl AppState {
    fn try_begin(&self) -> Result<(), String> {
        if self
            .busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("已有操作进行中，请稍候".into());
        }
        Ok(())
    }

    fn end(&self) {
        self.busy.store(false, Ordering::SeqCst);
    }
}

/// Releases the busy flag when dropped, so an action future dropped mid-await
/// (webview reload / window close) cannot leave the app stuck reporting
/// "已有操作进行中" until restart.
struct BusyGuard<'a>(&'a AppState);

impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.end();
    }
}

async fn run_blocking<T, F>(state: &AppState, work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    state.try_begin()?;
    let _guard = BusyGuard(state);
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| format!("后台任务异常: {e}"))?
}

#[tauri::command]
async fn get_app_status(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<StatusSnapshot, String> {
    let busy = state.busy.load(Ordering::SeqCst);
    let result =
        tauri::async_runtime::spawn_blocking(move || get_status(&app).map_err(|e| e.to_string()))
            .await
            .map_err(|e| format!("后台任务异常: {e}"))?;
    let mut status = result?;
    status.busy = busy;
    Ok(status)
}

#[tauri::command]
async fn get_themes() -> Result<Vec<ThemeSummary>, String> {
    tauri::async_runtime::spawn_blocking(|| list_themes().map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("后台任务异常: {e}"))?
}

#[tauri::command]
async fn preview_theme(id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || theme_preview(&id).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("后台任务异常: {e}"))?
}

#[tauri::command]
async fn preview_local_image(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || preview_image(&path).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("后台任务异常: {e}"))?
}

#[tauri::command]
async fn get_active_theme_image() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| active_theme_image().map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("后台任务异常: {e}"))?
}

#[tauri::command]
async fn install_dream_engine(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<ActionResult, String> {
    run_blocking(&state, move || {
        install_engine(&app).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
async fn apply_dream_skin(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<ActionResult, String> {
    run_blocking(&state, move || {
        apply_skin(Some(&app)).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
async fn pause_dream_skin(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<ActionResult, String> {
    run_blocking(&state, move || {
        pause_skin(Some(&app)).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
async fn restore_dream_skin(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<ActionResult, String> {
    run_blocking(&state, move || {
        restore_skin(&app).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
async fn switch_dream_theme(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<ActionResult, String> {
    run_blocking(&state, move || {
        switch_theme(Some(&app), &id).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
async fn delete_dream_theme(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<ActionResult, String> {
    run_blocking(&state, move || delete_theme(&id).map_err(|e| e.to_string())).await
}

#[tauri::command]
fn set_diagnostics(enabled: bool) -> Result<bool, String> {
    set_windows_diagnostics(enabled).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportPayload {
    path: Option<String>,
    theme_id: Option<String>,
    name: Option<String>,
    appearance: Option<String>,
    safe_area: Option<String>,
    task_mode: Option<String>,
    home_layout: Option<String>,
    focus_x: Option<f64>,
    focus_y: Option<f64>,
    surface_style: Option<String>,
    card_size: Option<String>,
    hero_title: Option<String>,
    hero_subtitle: Option<String>,
    project_label: Option<String>,
    status_text: Option<String>,
    accent_color: Option<String>,
    save_library: Option<bool>,
    apply_now: Option<bool>,
    file_base64: Option<String>,
    file_name: Option<String>,
}

#[tauri::command]
async fn import_dream_theme(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    payload: ImportPayload,
) -> Result<ActionResult, String> {
    run_blocking(&state, move || {
        let mut temporary_upload = None;
        let path = if let Some(path) = payload.path.filter(|p| !p.is_empty()) {
            path
        } else if let Some(theme_id) = payload.theme_id.filter(|p| !p.is_empty()) {
            resolve_theme_image_path(&theme_id).map_err(|e| e.to_string())?
        } else if let (Some(b64), Some(file_name)) = (payload.file_base64, payload.file_name) {
            let bytes =
                decode_base64_payload(&b64, max_import_image_bytes()).map_err(|e| e.to_string())?;
            let path = save_upload_bytes(&bytes, &file_name).map_err(|e| e.to_string())?;
            temporary_upload = Some(TemporaryUpload::new(&path));
            path
        } else {
            return Err("未提供图片".into());
        };
        let result = import_image_theme(
            Some(&app),
            &path,
            ImportOptions {
                name: payload.name,
                appearance: payload.appearance,
                safe_area: payload.safe_area,
                task_mode: payload.task_mode,
                home_layout: payload.home_layout,
                focus_x: payload.focus_x,
                focus_y: payload.focus_y,
                surface_style: payload.surface_style,
                card_size: payload.card_size,
                hero_title: payload.hero_title,
                hero_subtitle: payload.hero_subtitle,
                project_label: payload.project_label,
                status_text: payload.status_text,
                accent_color: payload.accent_color,
                save_library: payload.save_library,
                apply_now: payload.apply_now,
            },
        )
        .map_err(|e| e.to_string());
        drop(temporary_upload);
        result
    })
    .await
}

#[tauri::command]
async fn pick_image_path(app: AppHandle) -> Result<Option<String>, String> {
    let extensions: &[&str] = if cfg!(target_os = "windows") {
        &["png", "jpg", "jpeg", "webp"]
    } else {
        &["png", "jpg", "jpeg", "webp", "heic", "tif", "tiff"]
    };
    // blocking_pick_file pumps the dialog on the main thread while parking
    // this worker thread. Only the selected path crosses IPC, keeping large
    // originals out of the base64 bridge.
    let picked = app
        .dialog()
        .file()
        .set_title("选择一张纯背景图（建议 2560×1440，无 UI）")
        .add_filter("Images", extensions)
        .blocking_pick_file();
    match picked {
        Some(file) => file
            .into_path()
            .map(|path| Some(path.display().to_string()))
            .map_err(|error| format!("无法读取选中路径: {error}")),
        None => Ok(None),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    initialize_windows_diagnostics();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(AppState {
            busy: AtomicBool::new(false),
        }))
        .invoke_handler(tauri::generate_handler![
            get_app_status,
            get_themes,
            preview_theme,
            preview_local_image,
            get_active_theme_image,
            install_dream_engine,
            apply_dream_skin,
            pause_dream_skin,
            restore_dream_skin,
            switch_dream_theme,
            delete_dream_theme,
            set_diagnostics,
            import_dream_theme,
            pick_image_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dream Skin app");
}

#[cfg(test)]
mod tests {
    use super::TemporaryUpload;
    use std::fs;

    #[test]
    fn temporary_upload_removes_file_on_drop() {
        let path =
            std::env::temp_dir().join(format!("dream-skin-upload-guard-{}", std::process::id()));
        fs::write(&path, b"temporary").expect("create temporary upload");
        {
            let _upload = TemporaryUpload::new(&path);
            assert!(path.is_file());
        }
        assert!(!path.exists());
    }
}
