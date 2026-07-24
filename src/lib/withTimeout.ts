export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message?: string): Promise<T> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () =>
            reject(
              new Error(
                message ||
                  "操作等待超时。若正在首次启用皮肤，后台可能仍在重启 Codex，请稍等后点「刷新状态」；若反复出现请完全退出 Codex 后再试",
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}
