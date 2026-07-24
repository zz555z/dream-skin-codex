use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
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
    pub home_layout: Option<String>,
    pub focus_x: Option<f64>,
    pub focus_y: Option<f64>,
    pub surface_style: Option<String>,
    pub card_size: Option<String>,
    pub hero_title: Option<String>,
    pub hero_subtitle: Option<String>,
    pub project_label: Option<String>,
    pub status_text: Option<String>,
    pub accent_color: Option<String>,
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

fn sync_windows_live_runtime(app: &AppHandle, action_scripts: &[&str]) -> EngineResult<()> {
    let mut files = Vec::with_capacity(action_scripts.len() + 8);
    files.extend_from_slice(action_scripts);
    files.extend_from_slice(&[
        "scripts/start-dream-skin.ps1",
        "scripts/common-windows.ps1",
        "scripts/theme-windows.ps1",
        "scripts/config-utf8.ps1",
        "scripts/injector.mjs",
        "scripts/status-dream-skin.ps1",
        "scripts/image-metadata.mjs",
        "assets/renderer-inject.js",
        "assets/dream-skin.css",
        "APP_ENGINE_VERSION",
    ]);
    sync_engine_files(app, &files)
}

fn sync_macos_live_runtime(app: &AppHandle, action_scripts: &[&str]) -> EngineResult<()> {
    let mut files = Vec::with_capacity(action_scripts.len() + 9);
    files.extend_from_slice(action_scripts);
    files.extend_from_slice(&[
        "scripts/start-dream-skin-macos.sh",
        "scripts/common-macos.sh",
        "scripts/injector.mjs",
        "scripts/image-metadata.mjs",
        "scripts/stage-theme.mjs",
        "assets/renderer-inject.js",
        "assets/dream-skin.css",
        "APP_ENGINE_VERSION",
    ]);
    sync_engine_files(app, &files)
}

static COMMAND_OUTPUT_SEQUENCE: AtomicU64 = AtomicU64::new(0);

struct CommandOutputFiles {
    stdout: PathBuf,
    stderr: PathBuf,
}

impl CommandOutputFiles {
    fn new() -> Self {
        let sequence = COMMAND_OUTPUT_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let nonce = format!(
            "dream-skin-command-{}-{}-{}",
            std::process::id(),
            now_millis(),
            sequence
        );
        let root = std::env::temp_dir();
        Self {
            stdout: root.join(format!("{nonce}.stdout")),
            stderr: root.join(format!("{nonce}.stderr")),
        }
    }
}

impl Drop for CommandOutputFiles {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.stdout);
        let _ = fs::remove_file(&self.stderr);
    }
}

fn create_private_output_file(path: &Path) -> EngineResult<fs::File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    Ok(options.open(path)?)
}

const DEFAULT_COMMAND_TIMEOUT: Duration = Duration::from_secs(120);
const STATUS_COMMAND_TIMEOUT: Duration = Duration::from_secs(2);
const PROCESS_LOOKUP_TIMEOUT: Duration = Duration::from_secs(1);

fn kill_process_tree(child: &mut Child) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let pid = child.id();
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn run_command(program: &str, args: &[&str]) -> EngineResult<(i32, String, String)> {
    run_command_with_timeout(program, args, DEFAULT_COMMAND_TIMEOUT)
}

fn run_command_with_timeout(
    program: &str,
    args: &[&str],
    timeout: Duration,
) -> EngineResult<(i32, String, String)> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    // Pipes stay open when a Windows PowerShell script launches a long-lived
    // child that inherits its standard handles. Capture into files so waiting
    // is tied only to the command process, not to background Codex/Node jobs.
    let output_files = CommandOutputFiles::new();
    let stdout_file = create_private_output_file(&output_files.stdout)?;
    let stderr_file = create_private_output_file(&output_files.stderr)?;
    cmd.stdout(Stdio::from(stdout_file));
    cmd.stderr(Stdio::from(stderr_file));
    let mut child = cmd
        .spawn()
        .map_err(|e| EngineError::Message(format!("启动失败 ({program}): {e}")))?;

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if Instant::now() >= deadline {
                    kill_process_tree(&mut child);
                    return Err(EngineError::Message(format!(
                        "命令超时 ({timeout:?}): {program}"
                    )));
                }
                thread::sleep(Duration::from_millis(40));
            }
            Err(e) => {
                kill_process_tree(&mut child);
                return Err(EngineError::Message(format!("等待命令失败 ({program}): {e}")));
            }
        }
    };

    let code = status.code().unwrap_or(1);
    let stdout = String::from_utf8_lossy(&fs::read(&output_files.stdout).unwrap_or_default()).to_string();
    let stderr = String::from_utf8_lossy(&fs::read(&output_files.stderr).unwrap_or_default()).to_string();
    Ok((code, stdout, stderr))
}

#[cfg(all(test, unix))]
mod command_tests {
    use super::run_command;
    use std::time::{Duration, Instant};

    #[test]
    fn command_return_does_not_wait_for_background_output_handles() {
        let started = Instant::now();
        let (code, stdout, stderr) = run_command(
            "/bin/sh",
            &["-c", "sleep 2 & printf ready; printf warning >&2"],
        )
        .expect("command should complete");

        assert_eq!(code, 0);
        assert_eq!(stdout, "ready");
        assert_eq!(stderr, "warning");
        assert!(started.elapsed() < Duration::from_secs(1));
    }
}

fn humanize_engine_message(message: &str) -> String {
    let lower = message.to_ascii_lowercase();
    if lower.contains("node.js")
        && (lower.contains("not found")
            || lower.contains("is required")
            || message.contains("未找到 Node.js")
            || message.contains("需要 Node.js"))
    {
        return "未检测到 Node.js 22+。Windows 安装引擎需要 Node.js 22 或更高版本：到 https://nodejs.org 安装 LTS，勾选 Add to PATH，装好后重新打开本应用再点「一键安装引擎」。".into();
    }
    message.trim().to_string()
}

fn summarize(code: i32, stdout: &str, stderr: &str) -> ActionResult {
    let message = [stdout.trim(), stderr.trim()]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let message = humanize_engine_message(&message);
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
    let started_at = now_millis();
    write_windows_action_log("script-start", script_name, args, None, "", "", 0);
    let (code, stdout, stderr) = match run_command("powershell.exe", &argv) {
        Ok(output) => output,
        Err(error) => {
            write_windows_action_log(
                "script-error",
                script_name,
                args,
                None,
                "",
                &error.to_string(),
                now_millis().saturating_sub(started_at),
            );
            return Err(error);
        }
    };
    write_windows_action_log(
        "script-end",
        script_name,
        args,
        Some(code),
        &stdout,
        &stderr,
        now_millis().saturating_sub(started_at),
    );
    Ok(summarize(code, &stdout, &stderr))
}

fn write_windows_action_log(
    event: &str,
    script_name: &str,
    args: &[&str],
    code: Option<i32>,
    stdout: &str,
    stderr: &str,
    duration_ms: u128,
) {
    if !windows_diagnostics_enabled() {
        return;
    }
    let Ok(root) = state_root() else { return };
    if fs::create_dir_all(&root).is_err() {
        return;
    }
    let path = root.join("app-actions.log");
    if fs::metadata(&path)
        .map(|meta| meta.len() > 2 * 1024 * 1024)
        .unwrap_or(false)
    {
        let previous = root.join("app-actions.log.1");
        let _ = fs::remove_file(&previous);
        let _ = fs::rename(&path, &previous);
    }
    let clip = |value: &str| value.chars().take(4000).collect::<String>();
    let paused = root.join("paused").is_file();
    let engine_version =
        read_text_trimmed(&engine_root().unwrap_or_default().join("APP_ENGINE_VERSION"))
            .unwrap_or_else(|| "unknown".into());
    let record = serde_json::json!({
        "timestampMs": now_millis(),
        "source": "tauri",
        "event": event,
        "script": script_name,
        "args": args,
        "code": code,
        "durationMs": duration_ms,
        "pausedFile": paused,
        "engineVersion": engine_version,
        "stdout": clip(stdout),
        "stderr": clip(stderr),
    });
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{record}");
    }
}

fn windows_diagnostics_enabled() -> bool {
    if !cfg!(target_os = "windows") {
        return false;
    }
    if std::env::var("DREAM_SKIN_LOGS")
        .map(|value| value == "1")
        .unwrap_or(false)
    {
        return true;
    }
    state_root()
        .map(|root| root.join("enable-logs").is_file())
        .unwrap_or(false)
}

pub fn set_windows_diagnostics(enabled: bool) -> EngineResult<bool> {
    if !cfg!(target_os = "windows") {
        return Err(EngineError::Message("仅 Windows 支持诊断日志".into()));
    }
    let root = state_root()?;
    fs::create_dir_all(&root)?;
    let marker = root.join("enable-logs");
    if enabled {
        OpenOptions::new().create(true).write(true).open(marker)?;
    } else if marker.is_file() {
        fs::remove_file(marker)?;
    }
    Ok(enabled)
}

/// Create a startup record so support can distinguish a new Windows build
/// from an older installer even when no engine action has run yet.
pub fn initialize_windows_diagnostics() {
    if !windows_diagnostics_enabled() {
        return;
    }
    let Ok(root) = state_root() else { return };
    if fs::create_dir_all(&root).is_err() {
        return;
    }
    let path = root.join("app-actions.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let record = serde_json::json!({
            "timestampMs": now_millis(),
            "source": "tauri",
            "event": "app-start",
            "engineVersion": read_text_trimmed(&engine_root().unwrap_or_default().join("APP_ENGINE_VERSION"))
                .unwrap_or_else(|| "unknown".into()),
        });
        let _ = writeln!(file, "{record}");
    }
}

fn windows_process_running(image_names: &[&str]) -> bool {
    if image_names.is_empty() {
        return false;
    }
    // tasklist is much cheaper/safer than PowerShell cold-start on the poll path.
    for name in image_names {
        let filter = format!("IMAGENAME eq {name}");
        let ok = run_command_with_timeout(
            "tasklist.exe",
            &["/FI", filter.as_str(), "/NH"],
            PROCESS_LOOKUP_TIMEOUT,
        )
        .map(|(code, stdout, _)| {
            code == 0
                && stdout
                    .lines()
                    .any(|line| line.to_ascii_lowercase().contains(&name.to_ascii_lowercase()))
        })
        .unwrap_or(false);
        if ok {
            return true;
        }
    }
    false
}

fn windows_pid_running(pid: u32, expected_image: &str) -> bool {
    if pid == 0 {
        return false;
    }
    let filter = format!("PID eq {pid}");
    run_command_with_timeout(
        "tasklist.exe",
        &["/FI", filter.as_str(), "/NH"],
        PROCESS_LOOKUP_TIMEOUT,
    )
    .map(|(code, stdout, _)| {
        code == 0
            && stdout.lines().any(|line| {
                let lower = line.to_ascii_lowercase();
                lower.contains(&pid.to_string())
                    && lower.contains(&expected_image.to_ascii_lowercase())
            })
    })
    .unwrap_or(false)
}

fn windows_injector_alive(state_json: &Option<Value>) -> bool {
    let Some(state) = state_json.as_ref() else {
        return false;
    };
    let pid = state
        .get("injectorPid")
        .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        .unwrap_or(0) as u32;
    if pid == 0 {
        return false;
    }
    // PID + node.exe is enough for the desktop poll path. Matching start-time
    // required WMI/PowerShell and caused freezes/timeouts on some machines.
    windows_pid_running(pid, "node.exe")
}

fn is_codex_running() -> bool {
    if cfg!(target_os = "windows") {
        windows_process_running(&["ChatGPT.exe", "Codex.exe"])
    } else {
        run_command_with_timeout("/usr/bin/pgrep", &["-x", "ChatGPT"], Duration::from_secs(2))
            .map(|(code, _, _)| code == 0)
            .unwrap_or(false)
            || run_command_with_timeout("/usr/bin/pgrep", &["-x", "Codex"], Duration::from_secs(2))
                .map(|(code, _, _)| code == 0)
                .unwrap_or(false)
    }
}

fn parse_status_json(app: &AppHandle) -> Option<Value> {
    if cfg!(target_os = "macos") {
        let script = script_dir().ok()?.join("status-dream-skin-macos.sh");
        if !script.is_file() {
            return None;
        }
        let script_str = script.to_string_lossy().to_string();
        let (code, stdout, _) = run_command_with_timeout(
            "/bin/bash",
            &[script_str.as_str(), "--json"],
            STATUS_COMMAND_TIMEOUT,
        )
        .ok()?;
        if code != 0 {
            return None;
        }
        serde_json::from_str(stdout.trim()).ok()
    } else if cfg!(target_os = "windows") {
        // Read status from the bundled script so an app update fixes status
        // reporting immediately, even when an older engine is already
        // installed under LOCALAPPDATA.  Fall back to the installed copy for
        // development builds whose resource directory is unavailable.
        let bundled = bundled_engine_dir(app)
            .ok()
            .map(|root| root.join("scripts/status-dream-skin.ps1"));
        let installed = script_dir()
            .ok()
            .map(|dir| dir.join("status-dream-skin.ps1"));
        let script = bundled
            .into_iter()
            .chain(installed)
            .find(|candidate| candidate.is_file())?;
        let script_str = script.to_string_lossy().to_string();
        let (code, stdout, _) = run_command_with_timeout(
            "powershell.exe",
            &[
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                script_str.as_str(),
                "-Json",
            ],
            STATUS_COMMAND_TIMEOUT,
        )
        .ok()?;
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
    let meta = fs::metadata(path)?;
    if meta.len() == 0 {
        return Err(EngineError::Message("图片为空".into()));
    }
    // Keep previews modest so status/theme IPC cannot freeze the UI thread.
    let max_bytes = if cfg!(target_os = "windows") {
        4 * 1024 * 1024
    } else {
        12 * 1024 * 1024
    };
    if meta.len() > max_bytes as u64 {
        return Err(EngineError::Message("预览图过大".into()));
    }
    let bytes = fs::read(path)?;
    if bytes.is_empty() {
        return Err(EngineError::Message("图片为空".into()));
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
    let pause_path = state_root()?.join("paused");
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

    // Windows poll path stays pure-filesystem + tasklist. PowerShell cold starts
    // and base64 image encoding repeatedly froze or timed out the desktop UI.
    let status_json = if installed && !cfg!(target_os = "windows") {
        parse_status_json(app)
    } else {
        None
    };

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

    let injector_alive = if cfg!(target_os = "windows") {
        windows_injector_alive(&state_json)
    } else {
        status_json
            .as_ref()
            .and_then(|v| v.get("injectorAlive").and_then(|b| b.as_bool()))
            .unwrap_or(false)
    };

    let paused = pause_path.is_file();
    let session = if cfg!(target_os = "windows") {
        if injector_alive {
            if paused {
                "paused".into()
            } else {
                "active".into()
            }
        } else if paused {
            "paused".into()
        } else if state_json.is_some() {
            "stale".into()
        } else if installed {
            "ready".into()
        } else {
            "off".into()
        }
    } else {
        status_json
            .as_ref()
            .and_then(|v| read_json_field(v, "session"))
            .or_else(|| {
                state_json
                    .as_ref()
                    .and_then(|v| read_json_field(v, "session"))
            })
            .unwrap_or_else(|| {
                if installed {
                    "ready".into()
                } else {
                    "off".into()
                }
            })
    };

    let applied_theme_name = state_json
        .as_ref()
        .and_then(|v| read_json_field(v, "appliedThemeName"))
        .filter(|s| !s.is_empty())
        .or_else(|| {
            active_theme
                .as_ref()
                .and_then(|v| read_json_field(v, "name"))
        })
        .unwrap_or_default();

    let applied_theme_id = state_json
        .as_ref()
        .and_then(|v| read_json_field(v, "appliedThemeId"))
        .or_else(|| active_theme.as_ref().and_then(|v| read_json_field(v, "id")))
        .unwrap_or_default();

    // Do not base64 the active artwork on every status poll. Frontend loads the
    // left-card preview lazily via preview_theme when the applied id changes.
    let active_image_data_url = None;

    let codex_running = status_json
        .as_ref()
        .and_then(|v| v.get("codexRunning").and_then(|b| b.as_bool()))
        .unwrap_or_else(is_codex_running);

    let install_hint = if !can_install {
        "应用缺少内置引擎资源，请重新下载完整安装包。".into()
    } else if !installed {
        if codex_running {
            "请先完全退出 Codex / ChatGPT 桌面端，再点「一键安装引擎」。".into()
        } else if platform == "windows" {
            "Windows 需要先安装 Node.js 22+（勾选 Add to PATH），完全退出 Codex 后，再点「一键安装引擎」。".into()
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
        let image_name =
            read_json_field(&theme, "image").unwrap_or_else(|| "background.jpg".into());
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
        // Keep startup list metadata-only. Large base64 previews freeze the
        // Windows WebView when many themes are serialized over IPC at once.
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
            preview_data_url: None,
        });
    }
    themes.sort_by(|a, b| match (a.kind.as_str(), b.kind.as_str()) {
        ("preset", "custom") => std::cmp::Ordering::Less,
        ("custom", "preset") => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });
    Ok(themes)
}

pub fn theme_preview(id: &str) -> EngineResult<String> {
    let id = id.trim();
    if id.is_empty()
        || id.len() > 80
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(EngineError::Message("主题 ID 无效".into()));
    }
    let pack = themes_root()?.join(id);
    if !pack.is_dir() {
        return Err(EngineError::Message("主题不存在".into()));
    }
    let theme_json = pack.join("theme.json");
    if !theme_json.is_file() {
        return Err(EngineError::Message("主题缺少 theme.json".into()));
    }
    let theme = read_json_file(&theme_json)?;
    let image_name = read_json_field(&theme, "image").unwrap_or_else(|| {
        if cfg!(target_os = "windows") {
            "dream-reference.jpg".into()
        } else {
            "background.jpg".into()
        }
    });
    let mut image_path = pack.join(Path::new(&image_name).file_name().unwrap_or_default());
    if !image_path.is_file() {
        for fallback in [
            "background.jpg",
            "dream-reference.jpg",
            "art.jpg",
            "art.png",
        ] {
            let candidate = pack.join(fallback);
            if candidate.is_file() {
                image_path = candidate;
                break;
            }
        }
    }
    if !image_path.is_file() {
        return Err(EngineError::Message("主题预览图不存在".into()));
    }
    image_to_data_url(&image_path)
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
            result.message = format!("引擎已安装到 {}\n{}", target.display(), result.message);
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

pub fn apply_skin(app: Option<&AppHandle>) -> EngineResult<ActionResult> {
    if cfg!(target_os = "windows") {
        if engine_installed() {
            if let Some(app) = app {
                sync_windows_live_runtime(app, &[])?;
            }
        }
        run_windows_script("start-dream-skin.ps1", &["-RestartExisting"])
    } else {
        if engine_installed() {
            if let Some(app) = app {
                sync_macos_live_runtime(app, &[])?;
            }
        }
        run_macos_script("start-dream-skin-macos.sh", &["--prompt-restart"])
    }
}

pub fn pause_skin(app: Option<&AppHandle>) -> EngineResult<ActionResult> {
    if cfg!(target_os = "windows") {
        if engine_installed() {
            if let Some(app) = app {
                sync_windows_live_runtime(app, &["scripts/app-pause.ps1"])?;
            }
        }
        run_windows_script("app-pause.ps1", &[])
    } else {
        run_macos_script("pause-dream-skin-macos.sh", &[])
    }
}

pub fn restore_skin(app: &AppHandle) -> EngineResult<ActionResult> {
    if cfg!(target_os = "windows") {
        run_windows_script(
            "restore-dream-skin.ps1",
            &["-RestoreBaseTheme", "-ForceRestart"],
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

pub fn switch_theme(app: Option<&AppHandle>, id: &str) -> EngineResult<ActionResult> {
    assert_safe_theme_id(id)?;
    if cfg!(target_os = "windows") {
        if let Some(app) = app {
            sync_windows_live_runtime(app, &["scripts/app-switch-theme.ps1"])?;
        }
        run_windows_script("app-switch-theme.ps1", &["-ThemeId", id])
    } else {
        if let Some(app) = app {
            sync_macos_live_runtime(app, &["scripts/switch-theme-macos.sh"])?;
        }
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

fn safe_theme_text(value: Option<&str>, fallback: &str, max_chars: usize) -> String {
    let cleaned: String = value
        .unwrap_or("")
        .chars()
        .filter(|c| !c.is_control() && *c != '\u{2028}' && *c != '\u{2029}')
        .collect::<String>()
        .trim()
        .chars()
        .take(max_chars)
        .collect();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

fn safe_accent_color(value: Option<&str>) -> EngineResult<Option<String>> {
    let Some(raw) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let valid = raw.len() == 7
        && raw.starts_with('#')
        && raw[1..].chars().all(|character| character.is_ascii_hexdigit());
    if !valid {
        return Err(EngineError::Message(
            "强调色必须是六位十六进制颜色，例如 #e08a91".into(),
        ));
    }
    Ok(Some(raw.to_ascii_lowercase()))
}

fn safe_unit_value(value: Option<f64>, label: &str) -> EngineResult<Option<f64>> {
    let Some(value) = value else {
        return Ok(None);
    };
    if !value.is_finite() || !(0.0..=1.0).contains(&value) {
        return Err(EngineError::Message(format!(
            "{label} 必须是 0 到 1 之间的数字"
        )));
    }
    Ok(Some(value))
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


pub fn resolve_theme_image_path(theme_id: &str) -> EngineResult<String> {
    assert_safe_theme_id(theme_id)?;
    let root = themes_root()?;
    let dir = root.join(theme_id);
    if !dir.is_dir() {
        return Err(EngineError::Message("主题不存在，无法重新应用设置".into()));
    }
    let theme_json = dir.join("theme.json");
    let image_name = if theme_json.is_file() {
        read_json_file(&theme_json)
            .ok()
            .and_then(|v| read_json_field(&v, "image"))
            .unwrap_or_default()
    } else {
        String::new()
    };
    let mut candidates = Vec::new();
    if !image_name.is_empty() {
        if let Some(name) = Path::new(&image_name).file_name() {
            candidates.push(dir.join(name));
        }
    }
    for fallback in [
        "background.jpg",
        "dream-reference.jpg",
        "art.jpg",
        "art.png",
        "portal-hero.png",
    ] {
        candidates.push(dir.join(fallback));
    }
    for path in candidates {
        if path.is_file() {
            return Ok(path.display().to_string());
        }
    }
    // last resort: first image-looking file in theme dir
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let ext = path
                .extension()
                .and_then(|v| v.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp" | "heic" | "tif" | "tiff") {
                return Ok(path.display().to_string());
            }
        }
    }
    Err(EngineError::Message("主题图片缺失，请重新选择图片后应用".into()))
}

pub fn import_image_theme(
    app: Option<&AppHandle>,
    file_path: &str,
    options: ImportOptions,
) -> EngineResult<ActionResult> {
    if cfg!(target_os = "macos") {
        if let Some(app) = app {
            sync_macos_live_runtime(
                app,
                &[
                    "scripts/load-image-theme-macos.sh",
                    "scripts/write-theme.mjs",
                ],
            )?;
        }
    } else if cfg!(target_os = "windows") {
        if let Some(app) = app {
            sync_windows_live_runtime(app, &["scripts/app-import-image.ps1"])?;
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
    let home_layout = options.home_layout.as_deref().unwrap_or("auto");
    let surface_style = options.surface_style.as_deref().unwrap_or("balanced");
    let card_size = options.card_size.as_deref().unwrap_or("balanced");
    let focus_x = safe_unit_value(options.focus_x, "图片水平位置")?;
    let focus_y = safe_unit_value(options.focus_y, "图片垂直位置")?;
    let hero_title = safe_theme_text(
        options.hero_title.as_deref(),
        "我们今天来构建什么？",
        60,
    );
    let hero_subtitle = safe_theme_text(
        options.hero_subtitle.as_deref(),
        "和你的灵感一起，把想法写成代码。",
        120,
    );
    let project_label = safe_theme_text(options.project_label.as_deref(), "◉ 选择项目", 40);
    let status_text = safe_theme_text(options.status_text.as_deref(), "DREAM SKIN ONLINE", 40);
    let accent_color = safe_accent_color(options.accent_color.as_deref())?;
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
        (
            "homeLayout",
            home_layout,
            &["auto", "framed", "immersive"][..],
        ),
        (
            "surfaceStyle",
            surface_style,
            &["glass", "balanced", "solid"][..],
        ),
        (
            "cardSize",
            card_size,
            &["compact", "balanced", "showcase"][..],
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
            "-HomeLayout",
            home_layout,
            "-SurfaceStyle",
            surface_style,
            "-CardSize",
            card_size,
            "-HeroTitle",
            hero_title.as_str(),
            "-HeroSubtitle",
            hero_subtitle.as_str(),
            "-ProjectLabel",
            project_label.as_str(),
            "-StatusText",
            status_text.as_str(),
        ];
        let focus_x_arg = focus_x.map(|value| format!("{value:.4}"));
        let focus_y_arg = focus_y.map(|value| format!("{value:.4}"));
        if let Some(value) = focus_x_arg.as_deref() {
            args.push("-FocusX");
            args.push(value);
        }
        if let Some(value) = focus_y_arg.as_deref() {
            args.push("-FocusY");
            args.push(value);
        }
        if let Some(accent) = accent_color.as_deref() {
            args.push("-Accent");
            args.push(accent);
        }
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
        "--home-layout".to_string(),
        home_layout.to_string(),
        "--surface-style".to_string(),
        surface_style.to_string(),
        "--card-size".to_string(),
        card_size.to_string(),
        "--hero-title".to_string(),
        hero_title,
        "--hero-subtitle".to_string(),
        hero_subtitle,
        "--project-label".to_string(),
        project_label,
        "--status-text".to_string(),
        status_text,
    ];
    if let Some(value) = focus_x {
        mac_args.push("--focus-x".to_string());
        mac_args.push(format!("{value:.4}"));
    }
    if let Some(value) = focus_y {
        mac_args.push("--focus-y".to_string());
        mac_args.push(format!("{value:.4}"));
    }
    if let Some(accent) = accent_color {
        mac_args.push("--accent".to_string());
        mac_args.push(accent);
    }
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
