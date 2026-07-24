import assert from "node:assert/strict";

function fileNameFromPath(path) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|heic|tif{1,2})$/i;
function isImageFileName(name) {
  return IMAGE_EXT.test(name);
}
function themeNameFromImage(fileName) {
  const base = fileNameFromPath(fileName).trim();
  const stem = base.replace(/\.[^.]+$/, "").trim();
  return stem || base || "我的主题";
}
function resolveThemeName(inputName, imageFileName) {
  const typed = inputName.trim();
  if (typed) return typed;
  if (imageFileName) return themeNameFromImage(imageFileName);
  return "我的主题";
}

const DEFAULT_IMPORT_DRAFT = {
  themeName: "",
  appearance: "auto",
  safeArea: "auto",
  taskMode: "auto",
  homeLayout: "auto",
  surfaceStyle: "solid",
  cardSize: "balanced",
  useCustomFocus: false,
  focusX: 68,
  focusY: 44,
  heroTitle: "我们今天来构建什么？",
  heroSubtitle: "和你的灵感一起，把想法写成代码。",
  projectLabel: "◉ 选择项目",
  statusText: "DREAM SKIN ONLINE",
  accentColor: "#e08a91",
  useCustomAccent: false,
};

function importDraftReducer(state, action) {
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

async function mapPool(items, concurrency, worker) {
  if (!items.length) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => run()));
  return results;
}

assert.equal(themeNameFromImage("night-room.png"), "night-room");
assert.equal(resolveThemeName("  手写名  ", "a.png"), "手写名");
assert.equal(resolveThemeName("", "a.png"), "a");
assert.equal(isImageFileName("x.JPG"), true);
assert.equal(isImageFileName("x.txt"), false);

const next = importDraftReducer(DEFAULT_IMPORT_DRAFT, {
  type: "patch",
  patch: { appearance: "dark", themeName: "demo" },
});
assert.equal(next.appearance, "dark");
assert.equal(next.themeName, "demo");

const results = await mapPool([1, 2, 3, 4, 5], 2, async (n) => n * 2);
assert.deepEqual(results, [2, 4, 6, 8, 10]);

console.log("helper checks passed");
