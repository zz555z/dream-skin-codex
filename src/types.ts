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
  /** path|mtime|size of the applied image; UI fetches the data URL lazily */
  activeImageFingerprint: string;
  busy: boolean;
  installHint: string;
};

export type ImportPayload = {
  path?: string;
  /** Re-apply settings using a library theme's saved image */
  themeId?: string;
  name?: string;
  appearance?: string;
  safeArea?: string;
  taskMode?: string;
  homeLayout?: string;
  focusX?: number;
  focusY?: number;
  surfaceStyle?: string;
  cardSize?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  projectLabel?: string;
  statusText?: string;
  accentColor?: string;
  saveLibrary?: boolean;
  /** false = only stage into theme library, do not inject */
  applyNow?: boolean;
  fileBase64?: string;
  fileName?: string;
};
