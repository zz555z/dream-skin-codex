export type ActionResult = {
  ok: boolean;
  code: number;
  message: string;
  themeId?: string | null;
};

export type ThemeSummary = {
  id: string;
  name: string;
  tagline: string;
  appearance: string;
  kind: string;
  previewDataUrl?: string | null;
};

export type StatusSnapshot = {
  installed: boolean;
  canInstall: boolean;
  platform: string;
  engineRoot: string;
  stateRoot: string;
  bundledEngineRoot: string;
  engineVersion: string;
  session: string;
  port: number;
  codexRunning: boolean;
  injectorAlive: boolean;
  appliedThemeName: string;
  appliedThemeId: string;
  activeImageDataUrl?: string | null;
  busy: boolean;
  installHint: string;
};

export type ImportPayload = {
  path?: string;
  name?: string;
  appearance?: string;
  safeArea?: string;
  taskMode?: string;
  saveLibrary?: boolean;
  fileBase64?: string;
  fileName?: string;
};
