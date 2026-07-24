export type ImportDraft = {
  themeName: string;
  appearance: string;
  safeArea: string;
  taskMode: string;
  homeLayout: string;
  surfaceStyle: string;
  cardSize: string;
  useCustomFocus: boolean;
  focusX: number;
  focusY: number;
  heroTitle: string;
  heroSubtitle: string;
  projectLabel: string;
  statusText: string;
  accentColor: string;
  useCustomAccent: boolean;
};

export const DEFAULT_HERO_TITLE = "我们今天来构建什么？";
export const DEFAULT_HERO_SUBTITLE = "和你的灵感一起，把想法写成代码。";
export const DEFAULT_PROJECT_LABEL = "◉ 选择项目";
export const DEFAULT_STATUS_TEXT = "DREAM SKIN ONLINE";
export const DEFAULT_ACCENT_COLOR = "#e08a91";
export const DEFAULT_FOCUS_X = 68;
export const DEFAULT_FOCUS_Y = 44;
export const DEFAULT_HOME_LAYOUT = "auto";
export const DEFAULT_SURFACE_STYLE = "solid";
export const DEFAULT_CARD_SIZE = "balanced";

export const DEFAULT_IMPORT_DRAFT: ImportDraft = {
  themeName: "",
  appearance: "auto",
  safeArea: "auto",
  taskMode: "auto",
  homeLayout: DEFAULT_HOME_LAYOUT,
  surfaceStyle: DEFAULT_SURFACE_STYLE,
  cardSize: DEFAULT_CARD_SIZE,
  useCustomFocus: false,
  focusX: DEFAULT_FOCUS_X,
  focusY: DEFAULT_FOCUS_Y,
  heroTitle: DEFAULT_HERO_TITLE,
  heroSubtitle: DEFAULT_HERO_SUBTITLE,
  projectLabel: DEFAULT_PROJECT_LABEL,
  statusText: DEFAULT_STATUS_TEXT,
  accentColor: DEFAULT_ACCENT_COLOR,
  useCustomAccent: false,
};

export type ImportDraftAction =
  | { type: "patch"; patch: Partial<ImportDraft> }
  | { type: "setThemeName"; value: string }
  | { type: "resetThemeName" };

export function importDraftReducer(state: ImportDraft, action: ImportDraftAction): ImportDraft {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.patch };
    case "setThemeName":
      return { ...state, themeName: action.value };
    case "resetThemeName":
      return { ...state, themeName: "" };
    default:
      return state;
  }
}
