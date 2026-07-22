/** Theme display name helpers. */

export function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** Theme display name: strip extension from image file name. */
export function themeNameFromImage(fileName: string): string {
  const base = fileNameFromPath(fileName).trim();
  const stem = base.replace(/\.[^.]+$/, "").trim();
  return stem || base || "我的主题";
}

/** Prefer user-entered name; otherwise image file stem. */
export function resolveThemeName(inputName: string, imageFileName?: string | null): string {
  const typed = inputName.trim();
  if (typed) return typed;
  if (imageFileName) return themeNameFromImage(imageFileName);
  return "我的主题";
}
