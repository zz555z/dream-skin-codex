import type { StatusSnapshot } from "../types";
import { Chip } from "./Chip";

export function StagePanel({ status, installed }: { status: StatusSnapshot | null; installed: boolean }) {
  return (
    <section className="panel stage">
      <div className="stage-frame">
        <div
          className="stage-art"
          style={{
            backgroundImage: status?.activeImageDataUrl
              ? `url(${status.activeImageDataUrl})`
              : "none",
          }}
        />
        <div className="stage-scrim" />
        <div className="stage-copy">
          <p className="eyebrow">当前皮肤</p>
          <h2>{status?.appliedThemeName || (installed ? "—" : "引擎未安装")}</h2>
          <p className="muted">
            {!status
              ? "等待读取引擎状态…"
              : [
                  status.installed ? `会话 ${status.session}` : "引擎未安装",
                  `端口 ${status.port}`,
                  status.codexRunning ? "Codex 运行中" : "Codex 未运行",
                  status.engineVersion ? `引擎 ${status.engineVersion}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
          <div className="chip-row">
            <Chip
              text={status?.installed ? "引擎已就绪" : "需要安装引擎"}
              kind={status?.installed ? "ok" : "warn"}
            />
            <Chip
              text={status?.injectorAlive ? "注入器在线" : "注入器离线"}
              kind={status?.injectorAlive ? "ok" : "warn"}
            />
            <Chip
              text={status?.codexRunning ? "桌面端在线" : "桌面端离线"}
              kind={status?.codexRunning ? "ok" : ""}
            />
            <Chip
              text={
                status?.platform === "windows"
                  ? "Windows"
                  : status?.platform === "macos"
                    ? "macOS"
                    : "浏览器预览"
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}
