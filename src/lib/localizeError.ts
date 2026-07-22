/** Map common engine/script errors into short Chinese copy. */

const RULES: Array<{ test: RegExp; text: string }> = [
  { test: /code-signature|signature is not valid|signature is invalid/i, text: "ChatGPT 应用签名异常。请重装官方 ChatGPT / Codex 桌面端后再试。" },
  { test: /theme-backup|pre-install theme backup|No selective pre-install/i, text: "缺少安装前主题备份，皮肤已尽量清理，但外观设置可能未完全还原。" },
  { test: /Close Codex|close ChatGPT|完全退出|still running/i, text: "请先完全退出 Codex / ChatGPT 桌面端后再操作。" },
  { test: /Could not find the official ChatGPT|Could not find.*Codex/i, text: "未找到官方 ChatGPT / Codex 桌面端，请先安装并启动一次。" },
  { test: /未检测到 Dream Skin 引擎|engine not|未安装/i, text: "未检测到 Dream Skin 引擎，请先一键安装引擎。" },
  { test: /Image not found|图片文件不存在|Image larger than/i, text: "图片无效或不存在，请重新选择图片。" },
  { test: /CDP|debug port|endpoint cannot be verified/i, text: "无法连接桌面端调试端口。请确认 Codex 已启动，或先恢复官方后再试。" },
  { test: /Node\.js|未找到 Node|需要 Node/i, text: "未检测到 Node.js 22+。Windows 请安装 https://nodejs.org 的 LTS，勾选 Add to PATH，重新打开本应用后再安装引擎。" },
  { test: /Permission denied|Operation not permitted/i, text: "权限不足，请检查系统权限后重试。" },
  { test: /已取消选择|cancel/i, text: "已取消操作。" },
];

export function localizeErrorMessage(raw: string, fallback = "操作失败"): string {
  const text = (raw || "").trim();
  if (!text) return fallback;
  for (const rule of RULES) {
    if (rule.test.test(text)) return rule.text;
  }
  // Prefer last non-empty line (often the actionable error)
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] || text;
  if (/[\u4e00-\u9fff]/.test(last)) return last;
  return last.length > 160 ? `${last.slice(0, 160)}…` : last;
}
