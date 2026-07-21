import { invoke } from "@tauri-apps/api/core";
import type { ActionResult, ImportPayload, StatusSnapshot, ThemeSummary } from "../types";

export const api = {
  getStatus: () => invoke<StatusSnapshot>("get_app_status"),
  getThemes: () => invoke<ThemeSummary[]>("get_themes"),
  previewImage: (path: string) => invoke<string>("preview_local_image", { path }),
  install: () => invoke<ActionResult>("install_dream_engine"),
  apply: () => invoke<ActionResult>("apply_dream_skin"),
  pause: () => invoke<ActionResult>("pause_dream_skin"),
  restore: () => invoke<ActionResult>("restore_dream_skin"),
  switchTheme: (id: string) => invoke<ActionResult>("switch_dream_theme", { id }),
  deleteTheme: (id: string) => invoke<ActionResult>("delete_dream_theme", { id }),
  importTheme: (payload: ImportPayload) =>
    invoke<ActionResult>("import_dream_theme", { payload }),
  pickAndImport: (payload: ImportPayload) =>
    invoke<ActionResult>("pick_and_import_theme", { payload }),
};

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
