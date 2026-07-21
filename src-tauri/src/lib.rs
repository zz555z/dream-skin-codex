mod engine;

use engine::{
    apply_skin, decode_base64_payload, delete_theme, get_status, import_image_theme, install_engine,
    list_themes, pause_skin, preview_image, restore_skin, save_upload_bytes, switch_theme,
    ActionResult, ImportOptions, StatusSnapshot, ThemeSummary,
};
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

struct AppState {
    busy: AtomicBool,
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

async fn run_blocking<T, F>(state: &AppState, work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    state.try_begin()?;
    let result = tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| format!("后台任务异常: {e}"));
    state.end();
    result?
}

#[tauri::command]
fn get_app_status(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<StatusSnapshot, String> {
    let mut status = get_status(&app).map_err(|e| e.to_string())?;
    status.busy = state.busy.load(Ordering::SeqCst);
    Ok(status)
}

#[tauri::command]
fn get_themes() -> Result<Vec<ThemeSummary>, String> {
    list_themes().map_err(|e| e.to_string())
}

#[tauri::command]
fn preview_local_image(path: String) -> Result<String, String> {
    preview_image(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn install_dream_engine(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<ActionResult, String> {
    run_blocking(&state, move || install_engine(&app).map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn apply_dream_skin(state: State<'_, Arc<AppState>>) -> Result<ActionResult, String> {
    run_blocking(&state, || apply_skin().map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn pause_dream_skin(state: State<'_, Arc<AppState>>) -> Result<ActionResult, String> {
    run_blocking(&state, || pause_skin().map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn restore_dream_skin(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<ActionResult, String> {
    run_blocking(&state, move || restore_skin(&app).map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn switch_dream_theme(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<ActionResult, String> {
    run_blocking(&state, move || switch_theme(&id).map_err(|e| e.to_string())).await
}

#[tauri::command]
async fn delete_dream_theme(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<ActionResult, String> {
    run_blocking(&state, move || delete_theme(&id).map_err(|e| e.to_string())).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportPayload {
    path: Option<String>,
    name: Option<String>,
    appearance: Option<String>,
    safe_area: Option<String>,
    task_mode: Option<String>,
    save_library: Option<bool>,
    file_base64: Option<String>,
    file_name: Option<String>,
}

#[tauri::command]
async fn import_dream_theme(
    state: State<'_, Arc<AppState>>,
    payload: ImportPayload,
) -> Result<ActionResult, String> {
    run_blocking(&state, move || {
        let path = if let Some(path) = payload.path.filter(|p| !p.is_empty()) {
            path
        } else if let (Some(b64), Some(file_name)) = (payload.file_base64, payload.file_name) {
            let bytes = decode_base64_payload(&b64).map_err(|e| e.to_string())?;
            save_upload_bytes(&bytes, &file_name).map_err(|e| e.to_string())?
        } else {
            return Err("未提供图片".into());
        };
        import_image_theme(
            &path,
            ImportOptions {
                name: payload.name,
                appearance: payload.appearance,
                safe_area: payload.safe_area,
                task_mode: payload.task_mode,
                save_library: payload.save_library,
            },
        )
        .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
async fn pick_and_import_theme(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    payload: ImportPayload,
) -> Result<ActionResult, String> {
    // File dialog must stay on main thread.
    state.try_begin()?;
    let picked = app
        .dialog()
        .file()
        .set_title("选择一张纯背景图（建议 2560×1440，无 UI）")
        .add_filter(
            "Images",
            &["png", "jpg", "jpeg", "webp", "heic", "tif", "tiff"],
        )
        .blocking_pick_file();
    let path = match picked {
        Some(file) => match file.into_path() {
            Ok(path) => path.display().to_string(),
            Err(error) => {
                state.end();
                return Err(format!("无法读取选中路径: {error}"));
            }
        },
        None => {
            state.end();
            return Err("已取消选择".into());
        }
    };

    let result = tauri::async_runtime::spawn_blocking(move || {
        import_image_theme(
            &path,
            ImportOptions {
                name: payload.name,
                appearance: payload.appearance,
                safe_area: payload.safe_area,
                task_mode: payload.task_mode,
                save_library: payload.save_library.or(Some(true)),
            },
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("后台任务异常: {e}"));
    state.end();
    result?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(AppState {
            busy: AtomicBool::new(false),
        }))
        .invoke_handler(tauri::generate_handler![
            get_app_status,
            get_themes,
            preview_local_image,
            install_dream_engine,
            apply_dream_skin,
            pause_dream_skin,
            restore_dream_skin,
            switch_dream_theme,
            delete_dream_theme,
            import_dream_theme,
            pick_and_import_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dream Skin app");
}
