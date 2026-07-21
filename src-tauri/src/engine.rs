use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl Serialize for EngineError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type EngineResult<T> = Result<T, EngineError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionResult {
    pub ok: bool,
    pub code: i32,
    pub message: String,
    pub theme_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSummary {
    pub id: String,
    pub name: String,
    pub tagline: String,
    pub appearance: String,
    pub kind: String,
    pub preview_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusSnapshot {
    pub installed: bool,
    pub can_install: bool,
    pub platform: String,
    pub engine_root: String,
    pub state_root: String,
    pub bundled_engine_root: String,
    pub engine_version: String,
    pub session: String,
    pub port: u16,
    pub codex_running: bool,
    pub injector_alive: bool,
    pub applied_theme_name: String,
    pub applied_theme_id: String,
    pub active_image_data_url: Option<String>,
    pub busy: bool,
    pub install_hint: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOptions {
    pub name: Option<String>,
    pub appearance: Option<String>,
    pub safe_area: Option<String>,
    pub task_mode: Option<String>,
    pub save_library: Option<bool>,
    /// When false, only save into the theme library (no live inject).
    pub apply_now: Option<bool>,
}

fn home_dir() -> EngineResult<PathBuf> {
    dirs::home_dir().ok_or_else(|| EngineError::Message("无法解析用户主目录".into()))
}

pub fn platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "unsupported"
    }
}

pub fn engine_root() -> EngineResult<PathBuf> {
    if cfg!(target_os = "windows") {
        let base = dirs::data_local_dir()
            .ok_or_else(|| EngineError::Message("无法解析 LOCALAPPDATA".into()))?;
        Ok(base.join("CodexDreamSkin").join("engine"))
    } else {
        Ok(home_dir()?.join(".codex/codex-dream-skin-studio"))
    }
}

pub fn state_root() -> EngineResult<PathBuf> {
    if cfg!(target_os = "windows") {
        let base = dirs::data_local_dir()
            .ok_or_else(|| EngineError::Message("无法解析 LOCALAPPDATA".into()))?;
        Ok(base.join("CodexDreamSkin"))
    } else {
        Ok(home_dir()?.join("Library/Application Support/CodexDreamSkinStudio"))
    }
}

pub fn script_dir() -> EngineResult<PathBuf> {
    Ok(engine_root()?.join("scripts"))
}

pub fn theme_dir() -> EngineResult<PathBuf> {
    if cfg!(target_os = "windows") {
        Ok(state_root()?.join("active-theme"))
    } else {
        Ok(state_root()?.join("theme"))
    }
}

pub fn themes_root() -> EngineResult<PathBuf> {
    Ok(state_root()?.join("themes"))
}

pub fn engine_installed() -> bool {
    if cfg!(target_os = "windows") {
        script_dir()
            .map(|dir| dir.join("start-dream-skin.ps1").is_file())
            .unwrap_or(false)
    } else if cfg!(target_os = "macos") {
        script_dir()
            .map(|dir| dir.join("start-dream-skin-macos.sh").is_file())
            .unwrap_or(false)
    } else {
        false
    }
}

fn read_text_trimmed(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn bundled_engine_dir(app: &AppHandle) -> EngineResult<PathBuf> {
    let platform = platform_name();
    if platform == "unsupported" {
        return Err(EngineError::Message(
            "当前系统暂不支持（请使用 macOS 或 Windows）".into(),
        ));
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        for candidate in [
            resource_dir.join("resources/engine").join(platform),
            resource_dir.join("engine").join(platform),
            resource_dir.join(platform),
        ] {
            if candidate.join("scripts").is_dir() {
                return Ok(candidate);
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            for candidate in [
                parent.join("resources/engine").join(platform),
                parent.join("../Resources/resources/engine").join(platform),
                parent.join("../Resources/engine").join(platform),
            ] {
                if candidate.join("scripts").is_dir() {
                    return Ok(candidate);
                }
            }
        }
    }

    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources/engine")
        .join(platform);
    if dev.join("scripts").is_dir() {
        return Ok(dev);
    }

    Err(EngineError::Message(
        "应用内未找到 Dream Skin 引擎资源包，请重新安装本应用。".into(),
    ))
}

fn recursive_copy(src: &Path, dest: &Path) -> EngineResult<()> {
    if !src.exists() {
        return Err(EngineError::Message(format!(
            "源目录不存在: {}",
            src.display()
        )));
    }
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let from = entry.path();
        let to = dest.join(entry.file_name());
        if file_type.is_dir() {
            recursive_copy(&from, &to)?;
        } else if file_type.is_file() {
            if let Some(parent) = to.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// Best-effort refresh of selected engine files from the app bundle/resources.
/// Used so restore/control fixes ship without forcing a full reinstall.
fn sync_engine_files(app: &AppHandle, relative_paths: &[&str]) -> EngineResult<()> {
    let source_root = bundled_engine_dir(app)?;
    let target_root = engine_root()?;
    for rel in relative_paths {
        let from = source_root.join(rel);
        let to = target_root.join(rel);
        if !from.is_file() {
            continue;
        }
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(&from, &to)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if rel.ends_with(".sh") {
                let mut perms = fs::metadata(&to)?.permissions();
                perms.set_mode(0o755);
                fs::set_permissions(&to, perms)?;
            }
        }
    }
    Ok(())
}

fn run_command(program: &str, args: &[&str]) -> EngineResult<(i32, String, String)> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd
        .output()
        .map_err(|e| EngineError::Message(format!("启动失败 ({program}): {e}")))?;
    let code = output.status.code().unwrap_or(1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Ok((code, stdout, stderr))
}

fn summarize(code: i32, stdout: &str, stderr: &str) -> ActionResult {
    let message = [stdout.trim(), stderr.trim()]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let lines = message
        .lines()
        .filter(|l| !l.trim().is_empty())
        .rev()
        .take(6)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");
    let theme_id = message.lines().find_map(|line| {
        line.trim()
            .strip_prefix("THEME_ID=")
            .map(|v| v.trim().to_string())
    });
    ActionResult {
        ok: code == 0,
        code,
        message: if lines.is_empty() {
            if code == 0 {
                "完成".into()
            } else {
                "失败".into()
            }
        } else {
            lines
        },
        theme_id,
    }
}

fn run_macos_script(script_name: &str, args: &[&str]) -> EngineResult<ActionResult> {
    if !engine_installed() {
        return Err(EngineError::Message(
            "未检测到 Dream Skin 引擎，请先点击「一键安装引擎」。".into(),
        ));
    }
    let script = script_dir()?.join(script_name);
    if !script.is_file() {
        return Err(EngineError::Message(format!("缺少脚本: {script_name}")));
    }
    let script_str = script.to_string_lossy().to_string();
    let mut argv: Vec<&str> = Vec::with_capacity(1 + args.len());
    argv.push(script_str.as_str());
    argv.extend_from_slice(args);
    let (code, stdout, stderr) = run_command("/bin/bash", &argv)?;
    Ok(summarize(code, &stdout, &stderr))
}

fn run_windows_script(script_name: &str, args: &[&str]) -> EngineResult<ActionResult> {
    if !engine_installed() {
        return Err(EngineError::Message(
            "未检测到 Dream Skin 引擎，请先点击「一键安装引擎」。".into(),
        ));
    }
    let script = script_dir()?.join(script_name);
    if !script.is_file() {
        return Err(EngineError::Message(format!("缺少脚本: {script_name}")));
    }
    let script_str = script.to_string_lossy().to_string();
    let mut argv = vec![
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script_str.as_str(),
    ];
    argv.extend_from_slice(args);
    let (code, stdout, stderr) = run_command("powershell.exe", &argv)?;
    Ok(summarize(code, &stdout, &stderr))
}

fn is_codex_running() -> bool {
    if cfg!(target_os = "windows") {
        run_command("powershell.exe", &[
            "-NoProfile",
            "-Command",
            "if (Get-Process -Name 'Codex','OpenAI Codex' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }",
        ])
        .map(|(code, _, _)| code == 0)
        .unwrap_or(false)
    } else {
        run_command("/usr/bin/pgrep", &["-x", "ChatGPT"])
            .map(|(code, _, _)| code == 0)
            .unwrap_or(false)
            || run_command("/usr/bin/pgrep", &["-x", "Codex"])
                .map(|(code, _, _)| code == 0)
                .unwrap_or(false)
    }
}

fn parse_status_json() -> Option<Value> {
    if cfg!(target_os = "macos") {
        let script = script_dir().ok()?.join("status-dream-skin-macos.sh");
        if !script.is_file() {
            return None;
        }
        let script_str = script.to_string_lossy().to_string();
        let (code, stdout, _) = run_command("/bin/bash", &[script_str.as_str(), "--json"]).ok()?;
        if code != 0 {
            return None;
        }
        serde_json::from_str(stdout.trim()).ok()
    } else {
        None
    }
}

fn read_json_file(path: &Path) -> EngineResult<Value> {
    let text = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&text)?)
}

fn read_json_field(value: &Value, key: &str) -> Option<String> {
    match value.get(key)? {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn content_type_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "webp" => "image/webp",
        "heic" => "image/heic",
        "gif" => "image/gif",
        _ => "image/jpeg",
    }
}

fn image_to_data_url(path: &Path) -> EngineResult<String> {
    let bytes = fs::read(path)?;
    if bytes.is_empty() {
        return Err(EngineError::Message("图片为空".into()));
    }
    if bytes.len() > 12 * 1024 * 1024 {
        return Err(EngineError::Message("预览图过大".into()));
    }
    Ok(format!(
        "data:{};base64,{}",
        content_type_for(path),
        B64.encode(bytes)
    ))
}

pub fn preview_image(path: &str) -> EngineResult<String> {
    let file = PathBuf::from(path);
    if !file.is_file() {
        return Err(EngineError::Message("图片文件不存在".into()));
    }
    let meta = fs::metadata(&file)?;
    if meta.len() == 0 {
        return Err(EngineError::Message("图片为空".into()));
    }
    if meta.len() > 50 * 1024 * 1024 {
        return Err(EngineError::Message("图片超过 50MB".into()));
    }
    let name = file
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let allowed = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".tif", ".tiff"];
    if !allowed.iter().any(|ext| name.ends_with(ext)) {
        return Err(EngineError::Message("不支持的图片格式".into()));
    }
    // Large originals: still attempt preview; image_to_data_url caps at 12MB for UI safety.
    if meta.len() > 12 * 1024 * 1024 {
        return Err(EngineError::Message("预览图过大，仍可直接应用".into()));
    }
    image_to_data_url(&file)
}

pub fn get_status(app: &AppHandle) -> EngineResult<StatusSnapshot> {
    let platform = platform_name().to_string();
    let installed = engine_installed();
    let engine = engine_root()?.display().to_string();
    let state = state_root()?.display().to_string();
    let bundled = bundled_engine_dir(app)
        .map(|p| p.display().to_string())
        .unwrap_or_default();
    let can_install = !bundled.is_empty();
    let engine_root_path = engine_root()?;
    let engine_version = read_text_trimmed(&engine_root_path.join("APP_ENGINE_VERSION"))
        .or_else(|| read_text_trimmed(&engine_root_path.join("VERSION")))
        .or_else(|| {
            bundled_engine_dir(app)
                .ok()
                .and_then(|p| read_text_trimmed(&p.join("APP_ENGINE_VERSION")))
        })
        .unwrap_or_else(|| "unknown".into());

    let state_path = state_root()?.join("state.json");
    let theme_path = theme_dir()?.join("theme.json");
    let state_json = if state_path.is_file() {
        read_json_file(&state_path).ok()
    } else {
        None
    };
    let active_theme = if theme_path.is_file() {
        read_json_file(&theme_path).ok()
    } else {
        None
    };
    let status_json = if installed && cfg!(target_os = "macos") {
        parse_status_json()
    } else {
        None
    };

    let session = status_json
        .as_ref()
        .and_then(|v| read_json_field(v, "session"))
        .or_else(|| state_json.as_ref().and_then(|v| read_json_field(v, "session")))
        .unwrap_or_else(|| if installed { "ready".into() } else { "off".into() });

    let default_port = if cfg!(target_os = "windows") {
        9335
    } else {
        9341
    };
    let port = status_json
        .as_ref()
        .and_then(|v| v.get("port").and_then(|p| p.as_u64()))
        .or_else(|| {
            state_json
                .as_ref()
                .and_then(|v| v.get("port").and_then(|p| p.as_u64()))
        })
        .unwrap_or(default_port) as u16;

    let injector_alive = status_json
        .as_ref()
        .and_then(|v| v.get("injectorAlive").and_then(|b| b.as_bool()))
        .unwrap_or_else(|| {
            state_json
                .as_ref()
                .and_then(|v| read_json_field(v, "session"))
                .map(|s| s == "active")
                .unwrap_or(false)
        });

    let applied_theme_name = status_json
        .as_ref()
        .and_then(|v| read_json_field(v, "appliedThemeName"))
        .filter(|s| !s.is_empty())
        .or_else(|| {
            state_json
                .as_ref()
                .and_then(|v| read_json_field(v, "appliedThemeName"))
        })
        .or_else(|| active_theme.as_ref().and_then(|v| read_json_field(v, "name")))
        .unwrap_or_default();

    let applied_theme_id = state_json
        .as_ref()
        .and_then(|v| read_json_field(v, "appliedThemeId"))
        .or_else(|| active_theme.as_ref().and_then(|v| read_json_field(v, "id")))
        .unwrap_or_default();

    // Prefer the currently applied library pack for the left-card preview.
    // Fall back to the active theme dir only when no applied id is available.
    let active_image_data_url = {
        let from_applied = (!applied_theme_id.is_empty())
            .then_some(applied_theme_id.as_str())
            .and_then(|id| {
                let pack = themes_root().ok()?.join(id);
                let theme = read_json_file(&pack.join("theme.json")).ok()?;
                let image = read_json_field(&theme, "image")?;
                let path = pack.join(Path::new(&image).file_name()?);
                image_to_data_url(&path).ok()
            });
        from_applied.or_else(|| {
            active_theme.as_ref().and_then(|theme| {
                let image = read_json_field(theme, "image")?;
                let path = theme_dir().ok()?.join(Path::new(&image).file_name()?);
                image_to_data_url(&path).ok()
            })
        })
    };

    let codex_running = status_json
        .as_ref()
        .and_then(|v| v.get("codexRunning").and_then(|b| b.as_bool()))
        .unwrap_or_else(is_codex_running);

    let install_hint = if !can_install {
        "应用缺少内置引擎资源，请重新下载完整安装包。".into()
    } else if !installed {
        if codex_running {
            "请先完全退出 Codex / ChatGPT 桌面端，再点「一键安装引擎」。".into()
        } else {
            "首次使用：点「一键安装引擎」。会把引擎装到本机，不改官方安装包。".into()
        }
    } else {
        "引擎已就绪。可直接应用皮肤、切换主题或导入图片。".into()
    };

    Ok(StatusSnapshot {
        installed,
        can_install,
        platform,
        engine_root: engine,
        state_root: state,
        bundled_engine_root: bundled,
        engine_version,
        session,
        port,
        codex_running,
        injector_alive,
        applied_theme_name,
        applied_theme_id,
        active_image_data_url,
        busy: false,
        install_hint,
    })
}


/// Remove leftover duplicates from an older double-save import path:
/// `load-image-theme-macos.sh` wrote `img-*` while the app also wrote `custom-*`
/// for the same upload. Keep the `img-*` pack when name + image size match.
fn cleanup_legacy_double_save_duplicates() {
    let Ok(root) = themes_root() else {
        return;
    };
    if !root.is_dir() {
        return;
    }

    #[derive(Clone)]
    struct Pack {
        id: String,
        name: String,
        size: u64,
    }

    let mut packs: Vec<Pack> = Vec::new();
    let Ok(entries) = fs::read_dir(&root) else {
        return;
    };
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let id = entry.file_name().to_string_lossy().to_string();
        if !(id.starts_with("img-") || id.starts_with("custom-")) {
            continue;
        }
        let theme_json = entry.path().join("theme.json");
        let Ok(theme) = read_json_file(&theme_json) else {
            continue;
        };
        let name = read_json_field(&theme, "name").unwrap_or_else(|| id.clone());
        let image_name = read_json_field(&theme, "image").unwrap_or_else(|| "background.jpg".into());
        let mut image_path = entry
            .path()
            .join(Path::new(&image_name).file_name().unwrap_or_default());
        if !image_path.is_file() {
            for fallback in ["background.jpg", "dream-reference.jpg"] {
                let candidate = entry.path().join(fallback);
                if candidate.is_file() {
                    image_path = candidate;
                    break;
                }
            }
        }
        let Ok(meta) = fs::metadata(&image_path) else {
            continue;
        };
        packs.push(Pack {
            id,
            name,
            size: meta.len(),
        });
    }

    for pack in &packs {
        if !pack.id.starts_with("custom-") {
            continue;
        }
        let has_img_twin = packs.iter().any(|other| {
            other.id.starts_with("img-")
                && other.name == pack.name
                && other.size == pack.size
                && other.id != pack.id
        });
        if !has_img_twin {
            continue;
        }
        let dest = root.join(&pack.id);
        // Only remove known theme packs under themes root.
        if dest.starts_with(&root) && dest.is_dir() {
            let _ = fs::remove_dir_all(&dest);
        }
    }
}

pub fn list_themes() -> EngineResult<Vec<ThemeSummary>> {
    cleanup_legacy_double_save_duplicates();
    let root = themes_root()?;
    if !root.is_dir() {
        return Ok(vec![]);
    }
    let mut themes = Vec::new();
    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let id = entry.file_name().to_string_lossy().to_string();
        if !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
            || id.is_empty()
            || id.len() > 80
        {
            continue;
        }
        let theme_json = entry.path().join("theme.json");
        if !theme_json.is_file() {
            continue;
        }
        let theme = match read_json_file(&theme_json) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let name = read_json_field(&theme, "name").unwrap_or_else(|| id.clone());
        let tagline = read_json_field(&theme, "tagline").unwrap_or_default();
        let appearance = read_json_field(&theme, "appearance").unwrap_or_else(|| "auto".into());
        let image_name = read_json_field(&theme, "image").unwrap_or_else(|| {
            if cfg!(target_os = "windows") {
                "dream-reference.jpg".into()
            } else {
                "background.jpg".into()
            }
        });
        let mut image_path = entry
            .path()
            .join(Path::new(&image_name).file_name().unwrap_or_default());
        if !image_path.is_file() {
            // Windows presets may use dream-reference.jpg or background.jpg
            for fallback in ["background.jpg", "dream-reference.jpg", "art.jpg", "art.png"] {
                let candidate = entry.path().join(fallback);
                if candidate.is_file() {
                    image_path = candidate;
                    break;
                }
            }
        }
        let preview = if image_path.is_file() {
            image_to_data_url(&image_path).ok()
        } else {
            None
        };
        themes.push(ThemeSummary {
            id: id.clone(),
            name,
            tagline,
            appearance,
            kind: if id.starts_with("preset-") {
                "preset".into()
            } else {
                "custom".into()
            },
            preview_data_url: preview,
        });
    }
    themes.sort_by(|a, b| match (a.kind.as_str(), b.kind.as_str()) {
        ("preset", "custom") => std::cmp::Ordering::Less,
        ("custom", "preset") => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });
    Ok(themes)
}

pub fn install_engine(app: &AppHandle) -> EngineResult<ActionResult> {
    if platform_name() == "unsupported" {
        return Err(EngineError::Message(
            "当前系统暂不支持（请使用 macOS 或 Windows）".into(),
        ));
    }
    if is_codex_running() {
        return Err(EngineError::Message(
            "请先完全退出 Codex / ChatGPT 桌面端，再安装引擎（避免 config.toml 冲突）。".into(),
        ));
    }

    let source = bundled_engine_dir(app)?;
    let target = engine_root()?;

    if cfg!(target_os = "macos") {
        // Stage copy then install in-place without desktop launchers / auto start.
        let parent = target
            .parent()
            .ok_or_else(|| EngineError::Message("引擎安装路径无效".into()))?;
        fs::create_dir_all(parent)?;
        let staging = parent.join(format!(
            "codex-dream-skin-studio.installing.{}",
            std::process::id()
        ));
        if staging.exists() {
            fs::remove_dir_all(&staging)?;
        }
        recursive_copy(&source, &staging)?;
        let previous = parent.join(format!(
            "codex-dream-skin-studio.previous.{}",
            std::process::id()
        ));
        if target.exists() {
            if previous.exists() {
                fs::remove_dir_all(&previous)?;
            }
            fs::rename(&target, &previous)?;
        }
        if let Err(error) = fs::rename(&staging, &target) {
            if previous.exists() {
                let _ = fs::rename(&previous, &target);
            }
            return Err(EngineError::Message(format!("安装引擎失败: {error}")));
        }
        if previous.exists() {
            let _ = fs::remove_dir_all(&previous);
        }

        let script = target.join("scripts/install-dream-skin-macos.sh");
        let script_str = script.to_string_lossy().to_string();
        let (code, stdout, stderr) = run_command(
            "/bin/bash",
            &[
                script_str.as_str(),
                "--in-place",
                "--no-launch",
                "--no-launchers",
                "--port",
                "9341",
            ],
        )?;
        let mut result = summarize(code, &stdout, &stderr);
        if result.ok {
            result.message = format!(
                "引擎已安装到 {}\n{}",
                target.display(),
                result.message
            );
        }
        return Ok(result);
    }

    // Windows: copy skill root files, then run official installer with NoShortcuts.
    let skill_root = state_root()?.join("app-skill-source");
    if skill_root.exists() {
        fs::remove_dir_all(&skill_root)?;
    }
    fs::create_dir_all(&skill_root)?;
    recursive_copy(&source, &skill_root)?;
    let install = skill_root.join("scripts/install-dream-skin.ps1");
    let install_str = install.to_string_lossy().to_string();
    let (code, stdout, stderr) = run_command(
        "powershell.exe",
        &[
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            install_str.as_str(),
            "-NoShortcuts",
        ],
    )?;
    // Ensure app helper scripts exist in managed engine after installer copy.
    if let Ok(engine) = engine_root() {
        let helpers = [
            "app-switch-theme.ps1",
            "app-import-image.ps1",
            "app-pause.ps1",
        ];
        for helper in helpers {
            let from = source.join("scripts").join(helper);
            let to = engine.join("scripts").join(helper);
            if from.is_file() {
                let _ = fs::copy(&from, &to);
            }
        }
        let _ = fs::copy(
            source.join("APP_ENGINE_VERSION"),
            engine.join("APP_ENGINE_VERSION"),
        );
    }
    let mut result = summarize(code, &stdout, &stderr);
    if result.ok {
        result.message = format!(
            "引擎已安装到 {}\n{}",
            engine_root()?.display(),
            result.message
        );
    }
    Ok(result)
}

pub fn apply_skin() -> EngineResult<ActionResult> {
    if cfg!(target_os = "windows") {
        run_windows_script("start-dream-skin.ps1", &["-PromptRestart"])
    } else {
        run_macos_script("start-dream-skin-macos.sh", &["--prompt-restart"])
    }
}

pub fn pause_skin() -> EngineResult<ActionResult> {
    if cfg!(target_os = "windows") {
        run_windows_script("app-pause.ps1", &[])
    } else {
        run_macos_script("pause-dream-skin-macos.sh", &[])
    }
}

pub fn restore_skin(app: &AppHandle) -> EngineResult<ActionResult> {
    if cfg!(target_os = "windows") {
        run_windows_script(
            "restore-dream-skin.ps1",
            &["-RestoreBaseTheme", "-PromptRestart"],
        )
    } else {
        // Push the latest restore/control scripts into the installed engine first.
        // This recovers machines whose ChatGPT signature is already broken and
        // avoids requiring a full "reinstall engine" click after app updates.
        let _ = sync_engine_files(
            app,
            &[
                "scripts/common-macos.sh",
                "scripts/restore-dream-skin-macos.sh",
                "scripts/theme-config.mjs",
                "scripts/injector.mjs",
            ],
        );
        let mut result = run_macos_script(
            "restore-dream-skin-macos.sh",
            &["--restore-base-theme", "--restart-codex"],
        )?;
        if !result.ok {
            let lower = result.message.to_lowercase();
            if lower.contains("code-signature") || lower.contains("signature is not valid") {
                result.message = format!(
                    "恢复失败：本机 ChatGPT.app 代码签名已损坏，且未能自动恢复。\n{}",
                    result.message
                );
            } else if lower.contains("no selective pre-install theme backup")
                || lower.contains("theme-backup")
            {
                result.message = format!(
                    "皮肤会话已尽量清理，但缺少安装前主题备份（theme-backup.json）。\n{}",
                    result.message
                );
            }
        }
        Ok(result)
    }
}

pub fn switch_theme(id: &str) -> EngineResult<ActionResult> {
    assert_safe_theme_id(id)?;
    if cfg!(target_os = "windows") {
        run_windows_script("app-switch-theme.ps1", &["-ThemeId", id])
    } else {
        run_macos_script("switch-theme-macos.sh", &["--id", id])
    }
}

pub fn delete_theme(id: &str) -> EngineResult<ActionResult> {
    assert_safe_theme_id(id)?;
    let root = themes_root()?;
    let dest = root.join(id);
    if !dest.is_dir() {
        return Err(EngineError::Message("主题不存在".into()));
    }
    // Resolve and ensure the pack stays under themes/
    let root_canon = root.canonicalize().unwrap_or(root.clone());
    let dest_canon = dest.canonicalize().unwrap_or(dest.clone());
    if !dest_canon.starts_with(&root_canon) {
        return Err(EngineError::Message("主题路径不合法".into()));
    }
    fs::remove_dir_all(&dest_canon)?;
    Ok(ActionResult {
        ok: true,
        code: 0,
        message: format!("已删除主题 {id}"),
        theme_id: Some(id.to_string()),
    })
}

fn assert_safe_theme_id(id: &str) -> EngineResult<()> {
    if id.is_empty()
        || id.len() > 80
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(EngineError::Message("主题 ID 不合法".into()));
    }
    Ok(())
}

fn safe_theme_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .chars()
        .take(40)
        .collect();
    if cleaned.is_empty() {
        "我的主题".into()
    } else {
        cleaned
    }
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}


fn latest_imported_theme_id() -> Option<String> {
    let root = themes_root().ok()?;
    let mut best: Option<(std::time::SystemTime, String)> = None;
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !(name.starts_with("img-") || name.starts_with("custom-")) {
            continue;
        }
        let meta = entry.metadata().ok()?;
        let modified = meta.modified().ok()?;
        if best.as_ref().map(|(t, _)| modified > *t).unwrap_or(true) {
            best = Some((modified, name));
        }
    }
    best.map(|(_, id)| id)
}

pub fn import_image_theme(
    app: Option<&AppHandle>,
    file_path: &str,
    options: ImportOptions,
) -> EngineResult<ActionResult> {
    if cfg!(target_os = "macos") {
        if let Some(app) = app {
            let _ = sync_engine_files(
                app,
                &[
                    "scripts/load-image-theme-macos.sh",
                    "scripts/write-theme.mjs",
                    "scripts/common-macos.sh",
                ],
            );
        }
    } else if cfg!(target_os = "windows") {
        if let Some(app) = app {
            let _ = sync_engine_files(
                app,
                &[
                    "scripts/app-import-image.ps1",
                    "scripts/theme-windows.ps1",
                    "scripts/common-windows.ps1",
                ],
            );
        }
    }

    let path = PathBuf::from(file_path);
    if !path.is_file() {
        return Err(EngineError::Message("图片文件不存在".into()));
    }
    let meta = fs::metadata(&path)?;
    if meta.len() == 0 {
        return Err(EngineError::Message("图片为空".into()));
    }
    if meta.len() > 50 * 1024 * 1024 {
        return Err(EngineError::Message("图片超过 50MB".into()));
    }

    let fallback_name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("我的主题")
        .to_string();
    // Empty / whitespace name → fall back to image file stem.
    let provided = options
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let theme_name = safe_theme_name(provided.unwrap_or(&fallback_name));
    let appearance = options.appearance.as_deref().unwrap_or("auto");
    let safe_area = options.safe_area.as_deref().unwrap_or("auto");
    let task_mode = options.task_mode.as_deref().unwrap_or("auto");
    for (name, value, allowed) in [
        ("appearance", appearance, &["auto", "light", "dark"][..]),
        (
            "safeArea",
            safe_area,
            &["auto", "left", "right", "center", "none"][..],
        ),
        (
            "taskMode",
            task_mode,
            &["auto", "ambient", "banner", "off"][..],
        ),
    ] {
        if !allowed.contains(&value) {
            return Err(EngineError::Message(format!("无效的 {name}: {value}")));
        }
    }

    let path_str = path.to_string_lossy().to_string();
    let apply_now = options.apply_now.unwrap_or(true);
    let save_library = options.save_library.unwrap_or(true);

    if cfg!(target_os = "windows") {
        let mut args = vec![
            "-ImagePath",
            path_str.as_str(),
            "-Name",
            theme_name.as_str(),
            "-Appearance",
            appearance,
            "-SafeArea",
            safe_area,
            "-TaskMode",
            task_mode,
        ];
        // Library-only always persists; apply path keeps previous default.
        if save_library || !apply_now {
            args.push("-SaveLibrary");
        }
        if !apply_now {
            args.push("-NoApply");
        }
        return run_windows_script("app-import-image.ps1", &args);
    }

    // load-image-theme-macos.sh already copies the theme into themes/img-*.
    // Do not save again here, or the library shows two identical entries.
    let mut mac_args = vec![
        "--file".to_string(),
        path_str.clone(),
        "--name".to_string(),
        theme_name.clone(),
        "--appearance".to_string(),
        appearance.to_string(),
        "--safe-area".to_string(),
        safe_area.to_string(),
        "--task-mode".to_string(),
        task_mode.to_string(),
    ];
    if !apply_now {
        mac_args.push("--no-apply".to_string());
    }
    let mac_refs: Vec<&str> = mac_args.iter().map(String::as_str).collect();
    let mut result = run_macos_script("load-image-theme-macos.sh", &mac_refs)?;
    if result.ok {
        if let Some(theme_id) = latest_imported_theme_id() {
            result.theme_id = Some(theme_id);
        }
    }
    Ok(result)
}

pub fn save_upload_bytes(bytes: &[u8], file_name: &str) -> EngineResult<String> {
    if bytes.is_empty() {
        return Err(EngineError::Message("图片为空".into()));
    }
    if bytes.len() > 50 * 1024 * 1024 {
        return Err(EngineError::Message("图片超过 50MB".into()));
    }
    let ext = Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg")
        .to_ascii_lowercase();
    let allowed = ["jpg", "jpeg", "png", "webp", "heic", "tif", "tiff"];
    if !allowed.contains(&ext.as_str()) {
        return Err(EngineError::Message("不支持的图片格式".into()));
    }
    let uploads = state_root()?.join("tool-uploads");
    fs::create_dir_all(&uploads)?;
    let path = uploads.join(format!("{}-{}.{}", now_millis(), std::process::id(), ext));
    fs::write(&path, bytes)?;
    Ok(path.display().to_string())
}

pub fn decode_base64_payload(data: &str) -> EngineResult<Vec<u8>> {
    let trimmed = data
        .strip_prefix("data:")
        .and_then(|rest| rest.split_once(',').map(|(_, b64)| b64))
        .unwrap_or(data);
    B64.decode(trimmed.trim())
        .map_err(|e| EngineError::Message(format!("Base64 解码失败: {e}")))
}
