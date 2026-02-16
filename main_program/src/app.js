import { LifeEngine } from "./life-engine.js";
import { loadModelIndex } from "./model-loader.js";
import {
  ONBOARDING_KEY,
  normalizePath,
  DEFAULT_GENERATION_MS,
  MIN_GENERATION_MS,
  MAX_GENERATION_MS,
  SCENE_COLORS,
  formatMechanisms,
  formatGenerationMs,
  clamp,
  hashString,
  createSeededRng,
  getDateSeed,
  chooseActiveUnits,
  eventTracker,
} from "./utils.js";

const ZOOM_STEP_FACTOR = 1.12;
const CHILD_PREVIEW_START_RATIO = 0.68;
const CHILD_ENTRY_SCREEN_RATIO = 1.08;
const PARENT_ENTRY_ZOOM = 1.001;
const LAYER_TRANSITION_STYLE = "instant";
const LAYER_TRANSITION_DURATION_MS = 920;
const LAYER_TRANSITION_SWAP_RATIO = 0.5;
const CARD_AUTO_HIDE_DELAY_MS = 10000;
const KEYBOARD_SPEED_STEP_MS = 80;
const APP_SETTINGS_KEY = "shiran.home.settings.v2";
const SAVED_POOL_KEY = "shiran.home.saved.pool.v1";
const OVERVIEW_MODE_CORE = "core";
const OVERVIEW_MODE_DAILY = "daily";
const OVERVIEW_MODE_MIXED = "mixed";
const OVERVIEW_MODE_SAVED = "saved";
const MAX_CANVAS_UNITS = 360;
const MAX_DAILY_ITEMS_PER_SOURCE = 100;
const MAX_DAILY_ITEMS_TOTAL = 10000;
const OVERVIEW_RENDER_LIMIT = 320;
const MAX_SAVED_POOL_SIZE = 600;
const CONTENT_MODAL_SCALE_MIN = 0.8;
const CONTENT_MODAL_SCALE_MAX = 1.8;
const CONTENT_MODAL_SCALE_STEP = 0.1;

const RSS_SOURCE_PRESET_COLORS = [
  "#56c8ff", "#74d27f", "#ffc15a", "#ff8c42", "#f65d6d", "#4f7cff", "#c46ee8", "#33c6b4",
  "#e87a9a", "#8dd15f", "#ffb86b", "#6ec1ff", "#b989ff", "#ff6f91", "#6fd9a6", "#ffd166",
  "#57d3d8", "#a3c4f3", "#f7a072", "#9adf72", "#83b5ff", "#d17ee6", "#ff9e80", "#66d9ef",
  "#e6b566", "#a6e3a1", "#f38ba8", "#89b4fa", "#f9e2af", "#94e2d5", "#cba6f7", "#fab387",
];

const DEFAULT_RSS_SOURCES = [
  { id: "sspai", name: "少数派", url: "https://sspai.com/feed", enabled: true },
  { id: "google-blog", name: "Google Blog", url: "https://blog.google/rss/", enabled: true },
];

// Curated starter feeds that are generally stable for this project style.
const RECOMMENDED_RSS_SOURCES = [
  { name: "少数派", url: "https://sspai.com/feed" },
  { name: "Google Blog", url: "https://blog.google/rss/" },
  { name: "simonwillison.net", url: "https://simonwillison.net/atom/everything/" },
  { name: "mitchellh.com", url: "https://mitchellh.com/feed.xml" },
  { name: "overreacted.io", url: "https://overreacted.io/rss.xml" },
  { name: "dynomight.net", url: "https://dynomight.net/feed.xml" },
  { name: "devblogs.microsoft.com/oldnewthing", url: "https://devblogs.microsoft.com/oldnewthing/feed" },
  { name: "skyfall.dev", url: "https://skyfall.dev/rss.xml" },
  { name: "matklad.github.io", url: "https://matklad.github.io/feed.xml" },
  { name: "computer.rip", url: "https://computer.rip/rss.xml" },
  { name: "jyn.dev", url: "https://jyn.dev/atom.xml" },
  { name: "minimaxir.com", url: "https://minimaxir.com/index.xml" },
];

const RSS_STATUS_LABEL = {
  direct_ok: "可直连",
  proxy_needed: "需代理",
  unavailable: "不可用",
  unknown: "待检测",
};

// These hosts are known to block browser-side direct fetch in this deployment style.
const NO_DIRECT_FETCH_HOSTS = new Set([
  "www.ifanr.com",
  "ifanr.com",
]);

const state = {
  canvas: null,
  ctx: null,
  width: 0,
  height: 0,
  baseCellSize: 5,
  cols: 0,
  rows: 0,
  zoom: 1,
  minZoom: 1,
  maxZoom: 520,
  panX: 0,
  panY: 0,
  isDragging: false,
  dragPointerId: null,
  dragLastX: 0,
  dragLastY: 0,
  draggedDistance: 0,
  suppressClick: false,
  focusCellX: -1,
  focusCellY: -1,
  running: true,
  generationMs: DEFAULT_GENERATION_MS,
  generationStartTs: 0,
  generationIndex: 0,
  progress: 0,
  darkModeHighContrast: false,
  engine: null,
  modelIndex: null,
  activeUnits: [],
  ownerUnitMap: new Map(),
  ownerByUnitId: new Map(),
  ownerCentroids: new Map(),
  layerBackgroundColor: "#5d8fb8",
  toastTimer: null,
  cardHideTimer: null,
  layerSlot: 0,
  layerCycle: 0,
  layerSeedHint: null,
  overviewMode: OVERVIEW_MODE_MIXED,
  savedPool: [],
  savedBatchMode: false,
  savedSelection: new Set(),
  savedVisibleIds: [],
  previewContext: null,
  contentModalContext: null,
  contentModalScale: 1,
  appSettings: {
    openMode: "preview",
    rssSources: [],
  },
  rssDiagnostics: new Map(),
  rssManageQuery: "",
  rssManageFilter: "all",
  dailyFeed: {
    loading: false,
    items: [],
    errors: [],
    updatedAt: "",
  },
  moduleContentCache: new Map(),
  previewRequestId: 0,
  transition: {
    active: false,
    direction: "",
    startTs: 0,
    durationMs: LAYER_TRANSITION_DURATION_MS,
    swapRatio: LAYER_TRANSITION_SWAP_RATIO,
    swapped: false,
    anchorX: 0,
    anchorY: 0,
    wasRunning: true,
    captureCanvas: null,
  },
};

const ui = {
  speedInput: document.getElementById("speedInput"),
  speedValue: document.getElementById("speedValue"),
  zoomInput: document.getElementById("zoomInput"),
  zoomValue: document.getElementById("zoomValue"),
  resetViewBtn: document.getElementById("btnResetView"),
  legendBtn: document.getElementById("btnLegend"),
  fullscreenBtn: document.getElementById("btnFullscreen"),
  overviewBtn: document.getElementById("btnOverview"),
  settingsBtn: document.getElementById("btnSettings"),
  topControls: document.getElementById("topControls"),
  brandPanel: document.getElementById("brandPanel"),
  legendPanel: document.getElementById("legendPanel"),
  overviewDrawer: document.getElementById("overviewDrawer"),
  overviewClose: document.getElementById("overviewClose"),
  overviewBackdrop: document.getElementById("overviewBackdrop"),
  overviewList: document.getElementById("overviewList"),
  overviewMeta: document.getElementById("overviewMeta"),
  savedQuickAdd: document.getElementById("savedQuickAdd"),
  savedManualTitle: document.getElementById("savedManualTitle"),
  savedManualUrl: document.getElementById("savedManualUrl"),
  savedManualAddBtn: document.getElementById("savedManualAddBtn"),
  savedBatchToggleBtn: document.getElementById("savedBatchToggleBtn"),
  savedSelectAllBtn: document.getElementById("savedSelectAllBtn"),
  savedClearSelectionBtn: document.getElementById("savedClearSelectionBtn"),
  savedDeleteSelectedBtn: document.getElementById("savedDeleteSelectedBtn"),
  searchInput: document.getElementById("overviewSearch"),
  tabCore: document.getElementById("tabCore"),
  tabDaily: document.getElementById("tabDaily"),
  tabMixed: document.getElementById("tabMixed"),
  tabSaved: document.getElementById("tabSaved"),
  settingsDrawer: document.getElementById("settingsDrawer"),
  settingsClose: document.getElementById("settingsClose"),
  openModePreview: document.getElementById("openModePreview"),
  openModeDirect: document.getElementById("openModeDirect"),
  rssNameInput: document.getElementById("rssNameInput"),
  rssUrlInput: document.getElementById("rssUrlInput"),
  rssAddBtn: document.getElementById("rssAddBtn"),
  rssOpmlBtn: document.getElementById("rssOpmlBtn"),
  rssOpmlInput: document.getElementById("rssOpmlInput"),
  rssReloadBtn: document.getElementById("rssReloadBtn"),
  rssResetBtn: document.getElementById("rssResetBtn"),
  rssRecommendedList: document.getElementById("rssRecommendedList"),
  rssAddRecommendedBtn: document.getElementById("rssAddRecommendedBtn"),
  rssManageSearchInput: document.getElementById("rssManageSearchInput"),
  rssManageFilter: document.getElementById("rssManageFilter"),
  rssEnableFilteredBtn: document.getElementById("rssEnableFilteredBtn"),
  rssDisableFilteredBtn: document.getElementById("rssDisableFilteredBtn"),
  rssDeleteFilteredBtn: document.getElementById("rssDeleteFilteredBtn"),
  rssSourceMeta: document.getElementById("rssSourceMeta"),
  rssSourceList: document.getElementById("rssSourceList"),
  rssColorLegend: document.getElementById("rssColorLegend"),
  rssColorLegendInline: document.getElementById("rssColorLegendInline"),
  hintLayer: document.getElementById("hintLayer"),
  hintDismiss: document.getElementById("hintDismiss"),
  statusText: document.getElementById("statusText"),
  highContrastToggle: document.getElementById("highContrastToggle"),
  unitPreviewPanel: document.getElementById("unitPreview"),
  unitPreviewTitle: document.getElementById("unitPreviewTitle"),
  unitPreviewBody: document.getElementById("unitPreviewBody"),
  contentModal: document.getElementById("contentModal"),
  contentModalBackdrop: document.getElementById("contentModalBackdrop"),
  contentModalPanel: document.getElementById("contentModalPanel"),
  contentModalZoomOut: document.getElementById("contentModalZoomOut"),
  contentModalZoomReset: document.getElementById("contentModalZoomReset"),
  contentModalZoomIn: document.getElementById("contentModalZoomIn"),
  contentModalSave: document.getElementById("contentModalSave"),
  contentModalClose: document.getElementById("contentModalClose"),
  contentModalTitle: document.getElementById("contentModalTitle"),
  contentModalBody: document.getElementById("contentModalBody"),
  toast: document.getElementById("toast"),
};

function showToast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.add("visible");
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    ui.toast.classList.remove("visible");
  }, 2200);
}

function getAutoHideTargets() {
  return [
    ui.brandPanel,
    ui.topControls,
    ui.unitPreviewPanel,
    ui.statusText,
  ].filter(Boolean);
}

function setCardsAutoHidden(hidden) {
  const targets = getAutoHideTargets();
  for (let i = 0; i < targets.length; i += 1) {
    targets[i].classList.toggle("is-auto-hidden", hidden);
  }
}

function scheduleCardsAutoHide(delayMs = CARD_AUTO_HIDE_DELAY_MS) {
  if (state.cardHideTimer) clearTimeout(state.cardHideTimer);
  state.cardHideTimer = setTimeout(() => {
    setCardsAutoHidden(true);
  }, delayMs);
}

function revealCardsAndSchedule() {
  setCardsAutoHidden(false);
  scheduleCardsAutoHide();
}

function bindAutoHideCards() {
  const cards = getAutoHideTargets();
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    card.addEventListener("pointerenter", () => {
      setCardsAutoHidden(false);
      if (state.cardHideTimer) clearTimeout(state.cardHideTimer);
    });
    card.addEventListener("pointerleave", () => {
      scheduleCardsAutoHide();
    });
    card.addEventListener("focusin", () => {
      setCardsAutoHidden(false);
      if (state.cardHideTimer) clearTimeout(state.cardHideTimer);
    });
    card.addEventListener("focusout", () => {
      scheduleCardsAutoHide();
    });
  }
}

function updateFullscreenUi() {
  const active = !!document.fullscreenElement;
  ui.fullscreenBtn.textContent = active ? "🗗" : "⛶";
  ui.fullscreenBtn.setAttribute("aria-label", active ? "退出全屏" : "进入全屏");
  ui.fullscreenBtn.title = active ? "退出全屏" : "进入全屏";
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (_err) {
    showToast("当前环境不支持全屏或被浏览器拦截");
  } finally {
    updateFullscreenUi();
  }
}

function adjustSpeedByKeyboard(direction) {
  const delta = KEYBOARD_SPEED_STEP_MS;
  const next = direction === "faster"
    ? state.generationMs - delta
    : state.generationMs + delta;
  const before = state.generationMs;
  setGenerationMs(next);
  if (state.generationMs === before) return;
  showToast(`演化速度 ${formatGenerationMs(state.generationMs)}`);
  eventTracker("canvas_speed_change", {
    generation_ms: state.generationMs,
    source: "keyboard_arrow",
    direction,
  });
}

function adjustZoomByKeyboard(direction) {
  if (state.transition.active) return;
  const anchorX = state.width / 2;
  const anchorY = state.height / 2;
  const focus = screenToCell(anchorX, anchorY);
  state.focusCellX = focus.x;
  state.focusCellY = focus.y;

  if (direction === "in") {
    setZoom(state.zoom * ZOOM_STEP_FACTOR, anchorX, anchorY);
    maybeAutoLayerTransition(true, anchorX, anchorY);
  } else {
    const rawZoom = state.zoom / ZOOM_STEP_FACTOR;
    if (canEnterParentLayer() && rawZoom < state.minZoom * PARENT_ENTRY_ZOOM) {
      startLayerTransition("parent", anchorX, anchorY);
    } else {
      setZoom(rawZoom, anchorX, anchorY);
      maybeAutoLayerTransition(false, anchorX, anchorY);
    }
  }

  eventTracker("canvas_zoom_change", {
    zoom: Number(state.zoom.toFixed(2)),
    source: "keyboard_arrow",
    direction,
  });
}

function cloneDefaultRssSources() {
  return DEFAULT_RSS_SOURCES.map((s) => ({ ...s }));
}

function normalizeRssSource(raw, fallbackIndex = 0) {
  const name = String(raw?.name || "").trim() || `RSS源 ${fallbackIndex + 1}`;
  const url = normalizePath(String(raw?.url || "").trim());
  const enabled = raw?.enabled !== false;
  const baseId = raw?.id ? String(raw.id) : `${name}|${url}|${fallbackIndex}`;
  const id = String(baseId).trim() || `rss-${fallbackIndex}`;
  return {
    id,
    name,
    url,
    enabled,
  };
}

function loadAppSettings() {
  const fallback = {
    openMode: "preview",
    rssSources: cloneDefaultRssSources(),
  };

  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const openMode = parsed?.openMode === "direct" ? "direct" : "preview";
    const sourceList = Array.isArray(parsed?.rssSources) ? parsed.rssSources : [];
    const rssSources = sourceList.length > 0
      ? sourceList.map((s, idx) => normalizeRssSource(s, idx))
      : cloneDefaultRssSources();
    return { openMode, rssSources };
  } catch (_err) {
    return fallback;
  }
}

function saveAppSettings() {
  try {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(state.appSettings));
  } catch (_err) {
    // ignore storage quota/private mode errors
  }
}

function normalizeSavedEntry(raw, fallbackIndex = 0) {
  const toIso = (value, fallback = "") => {
    if (!value) return fallback;
    const ts = Date.parse(value);
    if (Number.isNaN(ts)) return fallback;
    return new Date(ts).toISOString();
  };
  const kind = raw?.kind === "daily" ? "daily" : "core";
  const title = String(raw?.title || "未命名收藏").trim();
  const summary = String(raw?.summary || "").trim();
  const scene = String(raw?.scene || "").trim();
  const sourceName = String(raw?.sourceName || (kind === "daily" ? "RSS" : "核心模块库")).trim();
  const sourceId = String(raw?.sourceId || "").trim().toLowerCase();
  const link = String(raw?.link || "").trim();
  const unitId = String(raw?.unitId || "").trim();
  const fingerprintBase = String(raw?.fingerprint || `${kind}|${unitId || sourceId || title}|${link}`).trim().toLowerCase();
  const fingerprint = fingerprintBase || `${kind}|fallback|${fallbackIndex}`;
  const id = String(raw?.id || `saved:${hashString(fingerprint)}`).trim() || `saved:${hashString(`${fingerprint}|${fallbackIndex}`)}`;
  const savedAt = toIso(raw?.savedAt, new Date().toISOString());
  const publishedAt = toIso(raw?.publishedAt, "");
  const mechanisms = Array.isArray(raw?.mechanisms)
    ? raw.mechanisms.map((m) => String(m || "").trim()).filter(Boolean).slice(0, 8)
    : [];

  return {
    id,
    kind,
    title,
    summary,
    scene,
    mechanisms,
    sourceName,
    sourceId,
    link,
    unitId,
    fingerprint,
    savedAt,
    publishedAt,
  };
}

function loadSavedPool() {
  try {
    const raw = localStorage.getItem(SAVED_POOL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed.map((entry, idx) => normalizeSavedEntry(entry, idx));
    const deduped = [];
    const seen = new Set();
    for (let i = 0; i < normalized.length; i += 1) {
      const item = normalized[i];
      if (seen.has(item.fingerprint)) continue;
      seen.add(item.fingerprint);
      deduped.push(item);
    }
    deduped.sort((a, b) => Date.parse(b.savedAt || 0) - Date.parse(a.savedAt || 0));
    return deduped.slice(0, MAX_SAVED_POOL_SIZE);
  } catch (_err) {
    return [];
  }
}

function saveSavedPool() {
  try {
    localStorage.setItem(SAVED_POOL_KEY, JSON.stringify(state.savedPool));
  } catch (_err) {
    // ignore storage quota/private mode errors
  }
}

function upsertSavedEntry(entry) {
  const normalized = normalizeSavedEntry(entry);
  const pool = Array.isArray(state.savedPool) ? [...state.savedPool] : [];
  const existsIdx = pool.findIndex((p) => p.fingerprint === normalized.fingerprint);
  const now = new Date().toISOString();

  if (existsIdx >= 0) {
    const merged = {
      ...pool[existsIdx],
      ...normalized,
      savedAt: now,
    };
    pool.splice(existsIdx, 1);
    pool.unshift(merged);
    state.savedPool = pool.slice(0, MAX_SAVED_POOL_SIZE);
    saveSavedPool();
    return { added: false, entry: merged };
  }

  const next = {
    ...normalized,
    savedAt: now,
  };
  pool.unshift(next);
  state.savedPool = pool.slice(0, MAX_SAVED_POOL_SIZE);
  saveSavedPool();
  return { added: true, entry: next };
}

function removeSavedEntryById(savedId) {
  const targetId = String(savedId || "").trim();
  if (!targetId) return { removed: false, entry: null };

  const pool = Array.isArray(state.savedPool) ? state.savedPool : [];
  const next = [];
  let removedEntry = null;

  for (let i = 0; i < pool.length; i += 1) {
    const normalized = normalizeSavedEntry(pool[i], i);
    if (!removedEntry && normalized.id === targetId) {
      removedEntry = normalized;
      continue;
    }
    next.push(pool[i]);
  }

  if (!removedEntry) return { removed: false, entry: null };
  state.savedPool = next;
  saveSavedPool();
  return { removed: true, entry: removedEntry };
}

function removeSavedEntriesByIds(savedIds) {
  const ids = Array.isArray(savedIds)
    ? savedIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (ids.length === 0) return { count: 0, removed: [] };

  const targets = new Set(ids);
  const pool = Array.isArray(state.savedPool) ? state.savedPool : [];
  const next = [];
  const removed = [];

  for (let i = 0; i < pool.length; i += 1) {
    const normalized = normalizeSavedEntry(pool[i], i);
    if (targets.has(normalized.id)) {
      removed.push(normalized);
      continue;
    }
    next.push(pool[i]);
  }

  if (removed.length === 0) return { count: 0, removed: [] };
  state.savedPool = next;
  saveSavedPool();
  return { count: removed.length, removed };
}

function pruneSavedSelection() {
  const valid = new Set();
  const pool = Array.isArray(state.savedPool) ? state.savedPool : [];
  for (let i = 0; i < pool.length; i += 1) {
    valid.add(normalizeSavedEntry(pool[i], i).id);
  }

  const next = new Set();
  for (const id of state.savedSelection) {
    if (valid.has(id)) next.add(id);
  }
  state.savedSelection = next;
}

function syncSavedBatchUi() {
  if (!ui.savedBatchToggleBtn || !ui.savedSelectAllBtn || !ui.savedClearSelectionBtn || !ui.savedDeleteSelectedBtn) return;

  const inSavedMode = state.overviewMode === OVERVIEW_MODE_SAVED;
  const batchMode = inSavedMode && state.savedBatchMode;
  const selectedCount = state.savedSelection.size;
  const visibleCount = Array.isArray(state.savedVisibleIds) ? state.savedVisibleIds.length : 0;

  ui.savedBatchToggleBtn.textContent = batchMode ? "退出批量" : "批量选择";
  ui.savedDeleteSelectedBtn.textContent = `删除已选 (${selectedCount})`;

  ui.savedBatchToggleBtn.disabled = !inSavedMode;
  ui.savedSelectAllBtn.disabled = !batchMode || visibleCount === 0;
  ui.savedClearSelectionBtn.disabled = !batchMode || selectedCount === 0;
  ui.savedDeleteSelectedBtn.disabled = !batchMode || selectedCount === 0;
}

function setSavedBatchMode(enabled) {
  const next = !!enabled;
  state.savedBatchMode = next;
  if (!next) {
    state.savedSelection.clear();
  } else {
    pruneSavedSelection();
  }
  renderOverviewList();
}

function setSavedSelection(savedId, selected) {
  const id = String(savedId || "").trim();
  if (!id) return;
  if (selected) state.savedSelection.add(id);
  else state.savedSelection.delete(id);
  syncSavedBatchUi();
}

function syncSettingsFormFromState() {
  ui.openModePreview.checked = state.appSettings.openMode !== "direct";
  ui.openModeDirect.checked = state.appSettings.openMode === "direct";
}

function syncBackdrop() {
  const open = ui.overviewDrawer.classList.contains("open") || ui.settingsDrawer.classList.contains("open");
  ui.overviewBackdrop.classList.toggle("visible", open);
}

function openOverview() {
  ui.settingsDrawer.classList.remove("open");
  ui.overviewDrawer.classList.add("open");
  syncBackdrop();
}

function closeOverview() {
  ui.overviewDrawer.classList.remove("open");
  syncBackdrop();
}

function toggleOverview() {
  if (ui.overviewDrawer.classList.contains("open")) {
    closeOverview();
  } else {
    openOverview();
  }
}

function openSettings() {
  ui.overviewDrawer.classList.remove("open");
  ui.settingsDrawer.classList.add("open");
  syncBackdrop();
}

function closeSettings() {
  ui.settingsDrawer.classList.remove("open");
  syncBackdrop();
}

function toggleSettings() {
  if (ui.settingsDrawer.classList.contains("open")) {
    closeSettings();
  } else {
    openSettings();
  }
}

function closeAllPanels() {
  ui.overviewDrawer.classList.remove("open");
  ui.settingsDrawer.classList.remove("open");
  syncBackdrop();
}

function isContentModalOpen() {
  return ui.contentModal.classList.contains("open");
}

function closeContentModal() {
  ui.contentModal.classList.remove("open");
  ui.contentModal.setAttribute("aria-hidden", "true");
  ui.contentModalBody.innerHTML = "<p>加载中...</p>";
  ui.contentModalBody.classList.remove("is-iframe-mode", "is-text-mode");
  state.contentModalContext = null;
  syncContentModalSaveButton();
}

function buildPreviewContextFromUnit(unit) {
  if (!unit) return null;
  const targetUrl = resolveUnitTargetUrl(unit) || unit.link || "";
  return {
    kind: "core",
    unit: {
      id: unit.id || "",
      slug: unit.slug || "",
      title: unit.title || "未命名模块",
      summary: unit.summary || "",
      scene: unit.scene || "",
      mechanisms: Array.isArray(unit.mechanisms) ? unit.mechanisms : [],
      status: unit.status || "published",
      link: targetUrl,
      source_mode: unit.source_mode || "core",
    },
  };
}

function buildPreviewContextFromDailyItem(item) {
  if (!item) return null;
  return {
    kind: "daily",
    item: {
      title: item.title || "每日新知",
      summary: item.summary || "",
      sourceName: item.sourceName || "RSS",
      sourceId: getSourceKeyForItem(item, "rss"),
      publishedAt: item.publishedAt || "",
      link: item.link || "",
      mechanisms: Array.isArray(item.mechanisms) ? item.mechanisms : ["外部优质信息源"],
      scene: item.scene || "每日新知流",
    },
  };
}

function normalizePreviewContext(context) {
  if (!context) return null;
  if (context.kind === "daily") return buildPreviewContextFromDailyItem(context.item || context);
  if (context.kind === "core") return buildPreviewContextFromUnit(context.unit || context);

  if (context.source_mode === "daily" || context.sourceId || context.sourceName) {
    return buildPreviewContextFromDailyItem(context);
  }
  return buildPreviewContextFromUnit(context);
}

function syncContentModalSaveButton() {
  if (!ui.contentModalSave) return;
  const enabled = !!state.contentModalContext;
  ui.contentModalSave.disabled = !enabled;
  ui.contentModalSave.title = enabled ? "把当前细胞加入收藏池" : "当前弹窗内容无法关联到细胞";
}

function syncContentModalScaleUi() {
  const scalePercent = Math.round(state.contentModalScale * 100);
  if (ui.contentModalZoomReset) {
    ui.contentModalZoomReset.textContent = `${scalePercent}%`;
  }
  if (ui.contentModalZoomOut) {
    ui.contentModalZoomOut.disabled = state.contentModalScale <= CONTENT_MODAL_SCALE_MIN + 1e-4;
  }
  if (ui.contentModalZoomIn) {
    ui.contentModalZoomIn.disabled = state.contentModalScale >= CONTENT_MODAL_SCALE_MAX - 1e-4;
  }
}

function setContentModalScale(nextScale, { silent = false } = {}) {
  const clamped = clamp(nextScale, CONTENT_MODAL_SCALE_MIN, CONTENT_MODAL_SCALE_MAX);
  state.contentModalScale = Number(clamped.toFixed(2));
  if (ui.contentModalPanel) {
    ui.contentModalPanel.style.setProperty("--content-modal-scale", String(state.contentModalScale));
  }
  syncContentModalScaleUi();
  if (!silent && isContentModalOpen()) {
    showToast(`阅读窗 ${Math.round(state.contentModalScale * 100)}%`);
  }
}

function adjustContentModalScale(direction) {
  if (direction === "in") {
    setContentModalScale(state.contentModalScale + CONTENT_MODAL_SCALE_STEP);
  } else if (direction === "out") {
    setContentModalScale(state.contentModalScale - CONTENT_MODAL_SCALE_STEP);
  } else {
    setContentModalScale(1);
  }
}

function saveCurrentModalCell() {
  const context = state.contentModalContext;
  if (!context) {
    showToast("当前弹窗内容无法加入收藏池");
    return;
  }

  const payload = context.kind === "daily"
    ? buildSavedEntryFromDaily(context.item)
    : buildSavedEntryFromUnit(context.unit);
  const result = upsertSavedEntry(payload);

  if (state.overviewMode === OVERVIEW_MODE_SAVED) {
    renderOverviewList();
    if (state.engine) buildEngineAndSeed();
  }

  showToast(result.added ? "已从弹窗加入收藏池" : "收藏已存在，已更新置顶");
}

function syncSavedQuickAddVisibility() {
  if (!ui.savedQuickAdd) return;
  const visible = state.overviewMode === OVERVIEW_MODE_SAVED;
  ui.savedQuickAdd.classList.toggle("is-hidden", !visible);
  syncSavedBatchUi();
}

function setOverviewMode(mode) {
  const prevMode = state.overviewMode;
  const next = [OVERVIEW_MODE_CORE, OVERVIEW_MODE_DAILY, OVERVIEW_MODE_MIXED, OVERVIEW_MODE_SAVED].includes(mode)
    ? mode
    : OVERVIEW_MODE_MIXED;
  state.overviewMode = next;
  if (next === OVERVIEW_MODE_DAILY) {
    ui.searchInput.placeholder = "搜索标题 / 来源 / 摘要";
  } else if (next === OVERVIEW_MODE_SAVED) {
    ui.searchInput.placeholder = "搜索收藏标题 / 来源 / 机制";
  } else if (next === OVERVIEW_MODE_MIXED) {
    ui.searchInput.placeholder = "搜索模块与新知";
  } else {
    ui.searchInput.placeholder = "搜索标题 / 场景 / 机制";
  }
  if (next !== OVERVIEW_MODE_SAVED && state.savedBatchMode) {
    state.savedBatchMode = false;
    state.savedSelection.clear();
  }
  renderOverviewModeTabs();
  syncSavedQuickAddVisibility();
  renderOverviewList();

  // Keep canvas source in sync with overview source mode.
  if (state.engine && prevMode !== next) {
    buildEngineAndSeed();
    showToast(`画布来源已切换为${getOverviewModeLabel(next)}`);
  }
}

function renderOverviewModeTabs() {
  const map = [
    [ui.tabCore, OVERVIEW_MODE_CORE],
    [ui.tabDaily, OVERVIEW_MODE_DAILY],
    [ui.tabMixed, OVERVIEW_MODE_MIXED],
    [ui.tabSaved, OVERVIEW_MODE_SAVED],
  ];
  for (let i = 0; i < map.length; i += 1) {
    const [el, mode] = map[i];
    if (!el) continue;
    const active = state.overviewMode === mode;
    el.classList.toggle("is-active", active);
    el.setAttribute("aria-selected", active ? "true" : "false");
  }
}

function stripHtml(input) {
  return String(input || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(input) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shortText(input, max = 84) {
  const text = stripHtml(input);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function formatDateTime(input) {
  if (!input) return "";
  const ts = Date.parse(input);
  if (!Number.isFinite(ts)) return "";
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function resolveEntryPath(pathValue) {
  const normalized = normalizePath(pathValue || "");
  if (!normalized) return "";
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith("../../ExportBlock/")) {
    return normalized.replace("../../ExportBlock/", "../ExportBlock/");
  }
  return normalized;
}

function resolveUnitTargetUrl(unit) {
  if (!unit) return "";
  const explicit = unit.url || unit.link || unit.entry?.url || "";
  if (/^https?:\/\//i.test(String(explicit))) {
    return String(explicit).trim();
  }
  return resolveEntryPath(unit.entry?.content || unit.entry_content || "");
}

function resolveFetchPath(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return encodeURI(url);
}

function normalizeTextForPreview(input) {
  return String(input || "").replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
}

function scoreDecodedText(text) {
  const sample = String(text || "").slice(0, 4000);
  if (!sample) return -1e9;
  const replacementCount = (sample.match(/\uFFFD/g) || []).length;
  const cjkCount = (sample.match(/[\u3400-\u9FFF]/g) || []).length;
  const controlCount = (sample.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  return cjkCount * 1.8 - replacementCount * 40 - controlCount * 8 + sample.length * 0.001;
}

function decodeModuleText(buffer) {
  // Prefer UTF-8 first. Most local markdown files are UTF-8 and should never be re-decoded.
  try {
    const utf8Text = normalizeTextForPreview(new TextDecoder("utf-8").decode(buffer));
    if (!utf8Text.includes("\uFFFD")) {
      return utf8Text;
    }
  } catch (_err) {
    // continue to fallbacks
  }

  const encodings = ["gb18030", "utf-16le"];
  let bestText = "";
  let bestScore = -1e9;

  for (let i = 0; i < encodings.length; i += 1) {
    const encoding = encodings[i];
    try {
      const decoder = new TextDecoder(encoding);
      const text = normalizeTextForPreview(decoder.decode(buffer));
      const score = scoreDecodedText(text);
      if (score > bestScore) {
        bestScore = score;
        bestText = text;
      }
    } catch (_err) {
      // ignore unsupported encodings
    }
  }

  if (bestText) return bestText;
  return normalizeTextForPreview(new TextDecoder("utf-8").decode(buffer));
}

function stripFrontMatter(text) {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) return text;
  return text.slice(end + 5);
}

function compactMarkdownForPreview(text, maxChars = 2600) {
  const normalized = stripFrontMatter(normalizeTextForPreview(text))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}\n\n...（内容较长，已截断）`;
}

function looksLikeTextDocument(url) {
  const value = String(url || "").toLowerCase();
  if (!value) return false;
  if (!/^https?:\/\//i.test(value)) return true;
  const clean = value.split("?")[0].split("#")[0];
  return clean.endsWith(".md") || clean.endsWith(".txt") || clean.endsWith(".json") || clean.endsWith(".yaml") || clean.endsWith(".yml");
}

async function openContentModal(url, title = "原文", options = {}) {
  if (!url) {
    showToast("没有可打开的原文地址");
    return;
  }

  const contextCandidate = options?.context || state.previewContext || null;
  state.contentModalContext = normalizePreviewContext(contextCandidate);
  syncContentModalSaveButton();

  const resolvedUrl = resolveFetchPath(url);
  ui.contentModalTitle.textContent = title || "原文";
  ui.contentModalBody.classList.remove("is-iframe-mode", "is-text-mode");
  ui.contentModalBody.innerHTML = "<p>加载中...</p>";
  ui.contentModal.classList.add("open");
  ui.contentModal.setAttribute("aria-hidden", "false");

  if (looksLikeTextDocument(url)) {
    try {
      const res = await fetch(resolvedUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const buffer = await res.arrayBuffer();
      const decoded = decodeModuleText(buffer);
      ui.contentModalBody.classList.add("is-text-mode");
      ui.contentModalBody.innerHTML = `<pre class="module-content">${escapeHtml(normalizeTextForPreview(decoded))}</pre>`;
      return;
    } catch (_err) {
      ui.contentModalBody.classList.add("is-text-mode");
      ui.contentModalBody.innerHTML = `
        <p class="content-modal-note">弹窗加载失败，可尝试新页打开。</p>
        <p><a class="source-open-link" href="${escapeHtml(resolvedUrl)}" target="_blank" rel="noopener noreferrer">新页打开</a></p>
      `;
      return;
    }
  }

  ui.contentModalBody.classList.add("is-iframe-mode");
  ui.contentModalBody.innerHTML = `
    <div class="content-modal-iframe-shell">
      <iframe src="${escapeHtml(resolvedUrl)}" loading="lazy" referrerpolicy="no-referrer"></iframe>
    </div>
    <div class="content-modal-footer">
      <p class="content-modal-note">若页面拒绝嵌入，请使用新页打开。</p>
      <p><a class="source-open-link" href="${escapeHtml(resolvedUrl)}" target="_blank" rel="noopener noreferrer">新页打开</a></p>
    </div>
  `;
}

async function loadUnitBodyContent(unit, requestId) {
  const contentSlot = ui.unitPreviewBody.querySelector("[data-module-content]");
  if (!contentSlot) return;

  const targetUrl = resolveUnitTargetUrl(unit);
  if (!targetUrl) {
    contentSlot.innerHTML = "<p>暂无模块正文内容。</p>";
    return;
  }

  const cacheKey = unit.id || targetUrl;
  if (state.moduleContentCache.has(cacheKey)) {
    const cached = state.moduleContentCache.get(cacheKey);
    if (requestId !== state.previewRequestId) return;
    contentSlot.innerHTML = `<pre class="module-content">${escapeHtml(cached)}</pre>`;
    return;
  }

  try {
    const res = await fetch(resolveFetchPath(targetUrl), { cache: "no-store" });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const buffer = await res.arrayBuffer();
    const decoded = decodeModuleText(buffer);
    const previewText = compactMarkdownForPreview(decoded);
    const finalText = previewText || "正文为空。";
    state.moduleContentCache.set(cacheKey, finalText);
    if (requestId !== state.previewRequestId) return;
    contentSlot.innerHTML = `<pre class="module-content">${escapeHtml(finalText)}</pre>`;
  } catch (_err) {
    if (requestId !== state.previewRequestId) return;
    contentSlot.innerHTML = `
      <p>正文加载失败，已展示摘要。你可以使用下方“打开原文”查看。</p>
    `;
  }
}

function renderUnitPreview(unit, sourceLabel = "核心模块库") {
  if (!unit) return;
  const targetUrl = resolveUnitTargetUrl(unit);
  const linkMarkup = targetUrl
    ? `<p><button type="button" class="source-open-btn inline-link-btn" data-inline-open="1" data-url="${escapeHtml(targetUrl)}" data-title="${escapeHtml(unit.title || "模块原文")}">打开原文</button></p>`
    : "";
  const saveMarkup = `<p><button type="button" class="source-open-btn preview-save-btn" data-preview-save="1">保存这个细胞到收藏池</button></p>`;

  state.previewContext = buildPreviewContextFromUnit(unit);

  ui.unitPreviewTitle.textContent = unit.title;
  ui.unitPreviewBody.innerHTML = `
    <div class="preview-meta">
      <span class="preview-chip preview-chip-source">${escapeHtml(sourceLabel)}</span>
      <span class="preview-chip">${escapeHtml(unit.scene || "未分类")}</span>
      <span class="preview-chip">${escapeHtml(unit.status || "draft")}</span>
    </div>
    <p class="preview-line"><strong>机制：</strong>${escapeHtml(formatMechanisms(unit.mechanisms))}</p>
    <p class="preview-line preview-summary"><strong>说明：</strong>${escapeHtml(shortText(unit.summary || "模块占位符，内容待补充", 120))}</p>
    <div data-module-content>
      <p>正文加载中...</p>
    </div>
    ${linkMarkup}
    ${saveMarkup}
  `;

  state.previewRequestId += 1;
  const requestId = state.previewRequestId;
  loadUnitBodyContent(unit, requestId);
}

function renderDailyPreview(item) {
  const timeText = formatDateTime(item.publishedAt);
  const source = item.sourceName || "RSS";
  const linkMarkup = item.link
    ? `<p><button type="button" class="source-open-btn inline-link-btn" data-inline-open="1" data-url="${escapeHtml(item.link)}" data-title="${escapeHtml(item.title || "每日新知原文")}">打开原文</button></p>`
    : "";
  const saveMarkup = `<p><button type="button" class="source-open-btn preview-save-btn" data-preview-save="1">保存这个细胞到收藏池</button></p>`;

  state.previewContext = buildPreviewContextFromDailyItem(item);

  ui.unitPreviewTitle.textContent = item.title || "每日新知";
  ui.unitPreviewBody.innerHTML = `
    <div class="preview-meta">
      <span class="preview-chip preview-chip-source">${escapeHtml(source)}</span>
      <span class="preview-chip">${escapeHtml(timeText || "未知时间")}</span>
      <span class="preview-chip">每日新知</span>
    </div>
    <p class="preview-line preview-summary"><strong>说明：</strong>${escapeHtml(shortText(item.summary || "暂无摘要", 140))}</p>
    ${linkMarkup}
    ${saveMarkup}
  `;
}

function buildSavedEntryFromUnit(unit) {
  const targetUrl = resolveUnitTargetUrl(unit) || unit?.link || "";
  const fingerprint = `core|${unit?.id || unit?.slug || unit?.title || ""}|${targetUrl}`;
  return {
    id: `saved:${hashString(fingerprint)}`,
    kind: "core",
    fingerprint,
    unitId: unit?.id || "",
    title: unit?.title || "未命名模块",
    summary: stripHtml(unit?.summary || ""),
    scene: unit?.scene || "",
    mechanisms: Array.isArray(unit?.mechanisms) ? unit.mechanisms : [],
    sourceName: "核心模块库",
    sourceId: "core",
    link: targetUrl,
    publishedAt: "",
  };
}

function buildSavedEntryFromDaily(item) {
  const sourceId = getSourceKeyForItem(item, "rss");
  const link = String(item?.link || "").trim();
  const title = String(item?.title || "每日新知").trim();
  const fingerprint = `daily|${sourceId}|${link || title}`;
  return {
    id: `saved:${hashString(fingerprint)}`,
    kind: "daily",
    fingerprint,
    unitId: "",
    title,
    summary: stripHtml(item?.summary || ""),
    scene: item?.scene || "每日新知流",
    mechanisms: Array.isArray(item?.mechanisms) ? item.mechanisms : ["外部优质信息源"],
    sourceName: item?.sourceName || "RSS",
    sourceId,
    link,
    publishedAt: item?.publishedAt || "",
  };
}

function saveCurrentPreviewCell() {
  const context = state.previewContext;
  if (!context) {
    showToast("当前没有可保存的细胞");
    return;
  }

  const payload = context.kind === "daily"
    ? buildSavedEntryFromDaily(context.item)
    : buildSavedEntryFromUnit(context.unit);
  const result = upsertSavedEntry(payload);
  if (state.overviewMode === OVERVIEW_MODE_SAVED) {
    renderOverviewList();
  }
  if (state.engine && state.overviewMode === OVERVIEW_MODE_SAVED) {
    buildEngineAndSeed();
  }
  showToast(result.added ? "已保存到收藏池" : "收藏已存在，已更新置顶");
}

function toggleHintIfNeeded() {
  const dismissed = localStorage.getItem(ONBOARDING_KEY) === "1";
  if (dismissed) {
    ui.hintLayer.classList.add("hidden");
    return;
  }

  ui.hintLayer.classList.remove("hidden");
  setTimeout(() => {
    ui.hintLayer.classList.add("hidden");
    localStorage.setItem(ONBOARDING_KEY, "1");
  }, 8000);
}

function dismissHint() {
  ui.hintLayer.classList.add("hidden");
  localStorage.setItem(ONBOARDING_KEY, "1");
}

function getSceneColor(scene) {
  return SCENE_COLORS[scene] || "#95a3bc";
}

function getLayerDepth() {
  return state.layerSlot;
}

function getLayerKey() {
  return `L${state.layerSlot}|C${state.layerCycle}`;
}

function getLayerSeedKey() {
  return `${getDateSeed()}|${getLayerKey()}`;
}

function pickSceneColorBySeed(seedText) {
  const palette = Object.values(SCENE_COLORS);
  if (palette.length === 0) return "#95a3bc";
  const idx = Math.abs(hashString(String(seedText))) % palette.length;
  return palette[idx];
}

function resolveColorForCellHint(cellX, cellY, owner = -1) {
  if (owner >= 0) {
    const unit = state.ownerUnitMap.get(owner);
    if (unit) return unit.source_color || getSceneColor(unit.scene);
  }
  return pickSceneColorBySeed(`${getLayerSeedKey()}|cell|${cellX}|${cellY}|${owner}`);
}

function getRenderCellSize() {
  return state.baseCellSize * state.zoom;
}

function getChildPreviewStartPx() {
  return Math.max(state.width, state.height) * CHILD_PREVIEW_START_RATIO;
}

function getChildEntryPx() {
  return Math.max(state.width, state.height) * CHILD_ENTRY_SCREEN_RATIO;
}

function getParentLandingZoom() {
  const target = (getChildEntryPx() / state.baseCellSize) * 0.92;
  return clamp(target, state.minZoom, state.maxZoom);
}

function getChildPreviewBlend(renderCell) {
  const start = getChildPreviewStartPx();
  const end = getChildEntryPx();
  if (renderCell <= start) return 0;
  if (renderCell >= end) return 1;
  return clamp((renderCell - start) / Math.max(1, end - start), 0, 1);
}

function hashNoise2d(x, y, seed) {
  let n = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 982451653)) >>> 0;
  n ^= n >>> 13;
  n = Math.imul(n, 1274126177) >>> 0;
  n ^= n >>> 16;
  return n / 4294967295;
}

function sampleFbm(u, v, seed) {
  const x1 = Math.floor(u * 5);
  const y1 = Math.floor(v * 5);
  const x2 = Math.floor(u * 11) + 17;
  const y2 = Math.floor(v * 11) + 23;
  const x3 = Math.floor(u * 23) + 31;
  const y3 = Math.floor(v * 23) + 47;
  const n1 = hashNoise2d(x1, y1, seed);
  const n2 = hashNoise2d(x2, y2, seed + 19);
  const n3 = hashNoise2d(x3, y3, seed + 47);
  return n1 * 0.56 + n2 * 0.29 + n3 * 0.15;
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return { r: 143, g: 166, b: 191 };
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return { r: 143, g: 166, b: 191 };
  const v = Number.parseInt(raw, 16);
  if (!Number.isFinite(v)) return { r: 143, g: 166, b: 191 };
  return {
    r: (v >> 16) & 255,
    g: (v >> 8) & 255,
    b: v & 255,
  };
}

function shadeRgb(rgb, lightness) {
  const l = clamp(lightness, 0.2, 1.7);
  return {
    r: Math.round(clamp(rgb.r * l, 0, 255)),
    g: Math.round(clamp(rgb.g * l, 0, 255)),
    b: Math.round(clamp(rgb.b * l, 0, 255)),
  };
}

function mixRgb(a, b, t) {
  const ratio = clamp(t, 0, 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * ratio),
    g: Math.round(a.g + (b.g - a.g) * ratio),
    b: Math.round(a.b + (b.b - a.b) * ratio),
  };
}

function rgbToCss(rgb) {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function drawChildPreviewInCell(px, py, size, owner, cellX, cellY, blend, sceneColor) {
  if (blend <= 0.01) return;

  const rgb = hexToRgb(sceneColor);
  const seed = hashString(`${getLayerSeedKey()}|preview|${cellX}|${cellY}|${owner}`);
  const steps = clamp(Math.floor(size / 18), 5, 18);
  const step = size / steps;
  const grain = Math.max(0.34, 1 - blend * 0.34);

  for (let sy = 0; sy < steps; sy += 1) {
    for (let sx = 0; sx < steps; sx += 1) {
      const u = (sx + 0.5) / steps;
      const v = (sy + 0.5) / steps;
      const n = sampleFbm(u + cellX * 0.17, v + cellY * 0.19, seed);
      const edge = Math.abs(n - 0.5);
      const coast = clamp((0.28 - edge) * 5.4, 0, 1);
      if (coast < 0.06) continue;

      const jitter = hashNoise2d(sx + cellX * steps, sy + cellY * steps, seed + 71);
      const light = 0.74 + n * 0.48 + (jitter - 0.5) * 0.26;
      const c = shadeRgb(rgb, light);
      const alpha = coast * blend * grain;

      state.ctx.globalAlpha = alpha;
      state.ctx.fillStyle = `rgb(${c.r}, ${c.g}, ${c.b})`;
      state.ctx.fillRect(px + sx * step, py + sy * step, step + 0.4, step + 0.4);
    }
  }
}

function syncZoomUi() {
  const percent = Math.round(state.zoom * 100);
  ui.zoomInput.value = String(percent);
  ui.zoomValue.textContent = `${percent}%`;
}

function clampPan() {
  const renderCell = getRenderCellSize();
  const worldWidth = state.cols * renderCell;
  const worldHeight = state.rows * renderCell;

  if (worldWidth <= state.width) {
    state.panX = (state.width - worldWidth) / 2;
  } else {
    const minX = state.width - worldWidth;
    state.panX = clamp(state.panX, minX, 0);
  }

  if (worldHeight <= state.height) {
    state.panY = (state.height - worldHeight) / 2;
  } else {
    const minY = state.height - worldHeight;
    state.panY = clamp(state.panY, minY, 0);
  }
}

function resetView(preserveZoom = false) {
  if (!preserveZoom) state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  clampPan();
  const center = screenToCell(state.width / 2, state.height / 2);
  state.focusCellX = center.x;
  state.focusCellY = center.y;
  syncZoomUi();
  updateStatusText();
}

function setZoom(newZoom, anchorScreenX = state.width / 2, anchorScreenY = state.height / 2) {
  const prevRenderCell = getRenderCellSize();
  const worldX = (anchorScreenX - state.panX) / prevRenderCell;
  const worldY = (anchorScreenY - state.panY) / prevRenderCell;

  state.zoom = clamp(newZoom, state.minZoom, state.maxZoom);

  const nextRenderCell = getRenderCellSize();
  state.panX = anchorScreenX - worldX * nextRenderCell;
  state.panY = anchorScreenY - worldY * nextRenderCell;

  clampPan();
  syncZoomUi();
  updateStatusText();
}

function screenToCell(screenX, screenY) {
  const renderCell = getRenderCellSize();
  return {
    x: Math.floor((screenX - state.panX) / renderCell),
    y: Math.floor((screenY - state.panY) / renderCell),
  };
}

function setViewAroundCell(cellX, cellY, zoom, anchorX = state.width / 2, anchorY = state.height / 2) {
  state.zoom = clamp(zoom, state.minZoom, state.maxZoom);
  const renderCell = getRenderCellSize();
  state.panX = anchorX - (cellX + 0.5) * renderCell;
  state.panY = anchorY - (cellY + 0.5) * renderCell;
  clampPan();
  syncZoomUi();
  updateStatusText();
}

function setGenerationMs(newMs) {
  const target = clamp(Math.floor(newMs), MIN_GENERATION_MS, MAX_GENERATION_MS);
  const now = performance.now();
  const prev = state.generationMs;
  const elapsed = now - state.generationStartTs;
  const ratio = prev > 0 ? clamp(elapsed / prev, 0, 1) : 0;

  state.generationMs = target;
  state.generationStartTs = now - ratio * state.generationMs;
  ui.speedInput.value = String(target);
  ui.speedValue.textContent = formatGenerationMs(target);

  updateStatusText();
}

function easeInOutCubic(t) {
  const x = clamp(t, 0, 1);
  if (x < 0.5) return 4 * x * x * x;
  return 1 - ((-2 * x + 2) ** 3) / 2;
}

function canEnterChildLayer() {
  return true;
}

function canEnterParentLayer() {
  return true;
}

function startLayerTransition(direction, anchorX = state.width / 2, anchorY = state.height / 2) {
  if (direction === "child" && !canEnterChildLayer()) {
    showToast("当前无法继续下潜");
    return false;
  }

  if (direction === "parent" && !canEnterParentLayer()) {
    showToast("当前已是顶层画布");
    return false;
  }

  if (LAYER_TRANSITION_STYLE === "instant") {
    if (direction === "child") {
      return enterChildLayer(anchorX, anchorY, { silent: false });
    }
    return enterParentLayer({
      silent: false,
      anchorX,
      anchorY,
      entryZoom: getParentLandingZoom(),
    });
  }

  if (state.transition.active) return false;

  state.transition.active = true;
  state.transition.direction = direction;
  state.transition.startTs = performance.now();
  state.transition.swapped = false;
  state.transition.anchorX = anchorX;
  state.transition.anchorY = anchorY;
  state.transition.wasRunning = state.running;
  state.transition.captureCanvas = null;

  const capture = document.createElement("canvas");
  capture.width = state.canvas.width;
  capture.height = state.canvas.height;
  const capCtx = capture.getContext("2d");
  if (capCtx) {
    capCtx.drawImage(state.canvas, 0, 0);
    state.transition.captureCanvas = capture;
  }

  state.running = false;
  return true;
}

function drawLayerTransition(ts) {
  if (!state.transition.active) return;

  const t = state.transition;
  const elapsed = ts - t.startTs;
  const progress = clamp(elapsed / t.durationMs, 0, 1);

  if (!t.swapped && progress >= t.swapRatio) {
    let switched = false;
    if (t.direction === "child") {
      switched = enterChildLayer(t.anchorX, t.anchorY, { silent: true });
    } else {
      switched = enterParentLayer({
        silent: true,
        anchorX: t.anchorX,
        anchorY: t.anchorY,
        entryZoom: getParentLandingZoom(),
      });
    }

    if (!switched) {
      t.active = false;
      state.running = t.wasRunning;
      return;
    }
    t.swapped = true;
    // Render the swapped layer immediately in this frame so transition feels continuous.
    drawBackground(ts);
    drawCells(ts);
  }

  const capture = t.captureCanvas;
  const hasCapture = !!capture;

  const drawCapturedFrame = (scale, alpha) => {
    if (!hasCapture) return;
    const w = state.width * scale;
    const h = state.height * scale;
    const dx = t.anchorX - w / 2;
    const dy = t.anchorY - h / 2;
    state.ctx.globalAlpha = clamp(alpha, 0, 1);
    state.ctx.drawImage(capture, 0, 0, capture.width, capture.height, dx, dy, w, h);
    state.ctx.globalAlpha = 1;
  };

  if (t.direction === "parent") {
    if (!t.swapped) {
      const p = easeInOutCubic(progress / t.swapRatio);
      drawCapturedFrame(1, 1);
      state.ctx.globalAlpha = 0.12 * p;
      state.ctx.fillStyle = "#071224";
      state.ctx.fillRect(0, 0, state.width, state.height);
      state.ctx.globalAlpha = 1;
    } else {
      const p = easeInOutCubic((progress - t.swapRatio) / (1 - t.swapRatio));
      drawCapturedFrame(1, 0.48 * (1 - p));
      state.ctx.globalAlpha = 0.16 * (1 - p);
      state.ctx.fillStyle = "#071224";
      state.ctx.fillRect(0, 0, state.width, state.height);
      state.ctx.globalAlpha = 1;
    }
  } else {
    if (!t.swapped) {
      const p = easeInOutCubic(progress / t.swapRatio);
      const scale = 1 + p * 1.28;
      drawCapturedFrame(scale, 1);
      state.ctx.globalAlpha = 0.08 * p;
      state.ctx.fillStyle = "#071224";
      state.ctx.fillRect(0, 0, state.width, state.height);
      state.ctx.globalAlpha = 1;
    } else {
      const p = easeInOutCubic((progress - t.swapRatio) / (1 - t.swapRatio));
      const scale = 2.28 + p * 1.34;
      drawCapturedFrame(scale, 0.52 * (1 - p));
      state.ctx.globalAlpha = 0.18 * (1 - p);
      state.ctx.fillStyle = "#071224";
      state.ctx.fillRect(0, 0, state.width, state.height);
      state.ctx.globalAlpha = 1;
    }
  }

  if (progress >= 1) {
    t.active = false;
    state.running = t.wasRunning;
    t.captureCanvas = null;
    showToast(`切换到画布 L${getLayerDepth()} · 循环 ${state.layerCycle}`);
  }
}

function maybeAutoLayerTransition(zoomIn, anchorX, anchorY) {
  if (state.transition.active) return true;

  if (zoomIn) {
    if (getRenderCellSize() >= getChildEntryPx()) {
      return startLayerTransition("child", anchorX, anchorY);
    }
    return false;
  }

  return false;
}

function pickFocusUnitById(unitId) {
  if (!unitId || !state.modelIndex?.items) return null;
  const found = state.modelIndex.items.find((u) => u.id === unitId);
  if (!found) return null;
  if (found.status === "archived") return null;
  return found;
}

function isHttpUrl(input) {
  return /^https?:\/\//i.test(String(input || "").trim());
}

function getHostFromUrl(url) {
  try {
    return new URL(String(url || "")).hostname.toLowerCase();
  } catch (_err) {
    return "";
  }
}

function normalizeManualUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  let candidate = raw;
  if (candidate.startsWith("//")) {
    candidate = `https:${candidate}`;
  } else if (!/^https?:\/\//i.test(candidate)) {
    // Allow quick input like "example.com/article" and normalize to https.
    candidate = `https://${candidate}`;
  }

  if (!isHttpUrl(candidate)) return "";
  try {
    const urlObj = new URL(candidate);
    if (!/^https?:$/i.test(urlObj.protocol)) return "";
    return urlObj.toString();
  } catch (_err) {
    return "";
  }
}

function inferManualTitle(url, titleInput = "") {
  const custom = String(titleInput || "").trim();
  if (custom) return custom;
  const host = getHostFromUrl(url) || "手动来源";
  const prettyHost = host.replace(/^www\./, "");
  return `手动收藏 · ${prettyHost}`;
}

function addManualUrlToSavedPool() {
  const normalizedUrl = normalizeManualUrl(ui.savedManualUrl?.value || "");
  if (!normalizedUrl) {
    showToast("请输入合法网址（支持 http/https）");
    return;
  }

  const host = getHostFromUrl(normalizedUrl) || "manual";
  const title = inferManualTitle(normalizedUrl, ui.savedManualTitle?.value || "");
  const payload = {
    kind: "daily",
    title,
    summary: "手动添加网址",
    scene: "每日新知流",
    mechanisms: ["手动收藏", "网址直达"],
    sourceName: `手动添加 · ${host.replace(/^www\./, "")}`,
    sourceId: `manual:${host}`,
    link: normalizedUrl,
    publishedAt: new Date().toISOString(),
    fingerprint: `manual|${normalizedUrl.toLowerCase()}`,
  };

  const result = upsertSavedEntry(payload);
  if (ui.savedManualUrl) ui.savedManualUrl.value = "";
  if (ui.savedManualTitle) ui.savedManualTitle.value = "";

  renderOverviewList();
  if (state.engine && state.overviewMode === OVERVIEW_MODE_SAVED) {
    buildEngineAndSeed();
  }
  showToast(result.added ? "已手动加入收藏池" : "该网址已在收藏池，已置顶");
}

function deleteSelectedSavedEntries() {
  const ids = [...state.savedSelection];
  if (ids.length === 0) {
    showToast("请先选择要删除的收藏");
    return;
  }

  const result = removeSavedEntriesByIds(ids);
  if (result.count <= 0) {
    showToast("删除失败：未找到选中收藏");
    return;
  }

  const removedDailyLinks = new Set(
    result.removed
      .filter((entry) => entry.kind === "daily")
      .map((entry) => String(entry.link || "").trim())
      .filter(Boolean),
  );
  const removedCoreIds = new Set(
    result.removed
      .filter((entry) => entry.kind === "core")
      .map((entry) => String(entry.unitId || "").trim())
      .filter(Boolean),
  );

  if (state.previewContext?.kind === "daily") {
    const link = String(state.previewContext?.item?.link || "").trim();
    if (link && removedDailyLinks.has(link)) state.previewContext = null;
  } else if (state.previewContext?.kind === "core") {
    const unitId = String(state.previewContext?.unit?.id || "").trim();
    if (unitId && removedCoreIds.has(unitId)) state.previewContext = null;
  }

  if (state.contentModalContext?.kind === "daily") {
    const link = String(state.contentModalContext?.item?.link || "").trim();
    if (link && removedDailyLinks.has(link)) {
      state.contentModalContext = null;
      syncContentModalSaveButton();
    }
  } else if (state.contentModalContext?.kind === "core") {
    const unitId = String(state.contentModalContext?.unit?.id || "").trim();
    if (unitId && removedCoreIds.has(unitId)) {
      state.contentModalContext = null;
      syncContentModalSaveButton();
    }
  }

  state.savedSelection.clear();
  renderOverviewList();
  if (state.engine && state.overviewMode === OVERVIEW_MODE_SAVED) {
    buildEngineAndSeed();
  }
  showToast(`已批量删除 ${result.count} 条收藏`);
}

function canFetchSourceDirectly(source) {
  const host = getHostFromUrl(source?.url || "");
  if (!host) return false;
  return !NO_DIRECT_FETCH_HOSTS.has(host);
}

function parseOpmlSources(opmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(opmlText || ""), "text/xml");
  const invalid = doc.querySelector("parsererror");
  if (invalid) throw new Error("opml parse error");

  const nodes = [...doc.querySelectorAll("outline")];
  const parsed = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const url = String(
      node.getAttribute("xmlUrl")
      || node.getAttribute("xmlurl")
      || node.getAttribute("url")
      || "",
    ).trim();
    if (!isHttpUrl(url)) continue;

    const rawName = String(
      node.getAttribute("title")
      || node.getAttribute("text")
      || getHostFromUrl(url)
      || `RSS源 ${i + 1}`,
    ).trim();
    const name = rawName || `RSS源 ${i + 1}`;
    parsed.push(normalizeRssSource({
      id: `rss-${hashString(`${name}|${url}`)}`,
      name,
      url,
      enabled: true,
    }, i));
  }

  const deduped = [];
  const seen = new Set();
  for (let i = 0; i < parsed.length; i += 1) {
    const item = parsed[i];
    const key = String(item.url || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function mergeImportedRssSources(importedSources) {
  const current = Array.isArray(state.appSettings.rssSources)
    ? [...state.appSettings.rssSources]
    : [];
  const existingUrls = new Set(current.map((s) => String(s.url || "").trim().toLowerCase()));
  let added = 0;
  let skipped = 0;

  for (let i = 0; i < importedSources.length; i += 1) {
    const source = importedSources[i];
    const normalized = normalizeRssSource(source, i);
    const key = String(normalized.url || "").trim().toLowerCase();
    if (!key || existingUrls.has(key)) {
      skipped += 1;
      continue;
    }
    existingUrls.add(key);
    current.push(normalized);
    added += 1;
  }

  state.appSettings.rssSources = current;
  return { added, skipped };
}

function getCoreUnits() {
  if (!state.modelIndex?.items) return [];
  return state.modelIndex.items.filter((u) => u.status !== "archived");
}

function buildCoreOverviewItems() {
  const units = getCoreUnits();
  units.sort((a, b) => {
    const as = Number(a.source_seq || 0);
    const bs = Number(b.source_seq || 0);
    return as - bs;
  });
  return units.map((u) => ({
    type: "core",
    id: `core:${u.id}`,
    unit: u,
    title: u.title,
    summary: u.summary || "",
    scene: u.scene || "",
    mechanisms: u.mechanisms || [],
    sourceName: "核心模块库",
    publishedAt: "",
    link: resolveUnitTargetUrl(u),
  }));
}

function normalizeFeedItem(raw, source) {
  const title = String(raw?.title || "").trim();
  const link = String(raw?.link || raw?.url || "").trim();
  if (!title || !link) return null;

  const summary = raw?.description || raw?.contentSnippet || raw?.content || "";
  const publishedAt = raw?.pubDate || raw?.isoDate || raw?.published || new Date().toISOString();
  const idSeed = `${source.id}|${title}|${link}|${publishedAt}`;
  return {
    type: "daily",
    id: `daily:${hashString(idSeed)}`,
    title,
    summary: stripHtml(summary),
    scene: "每日新知流",
    mechanisms: ["外部优质信息源"],
    sourceName: source.name,
    publishedAt,
    link,
    sourceId: source.id,
  };
}

function parseFeedXml(xmlText, source) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const invalid = doc.querySelector("parsererror");
  if (invalid) throw new Error("rss xml parse error");

  const nodes = [...doc.querySelectorAll("item"), ...doc.querySelectorAll("entry")];
  if (nodes.length === 0) return [];

  return nodes.map((node) => {
    const title = node.querySelector("title")?.textContent?.trim() || "";
    const linkNode = node.querySelector("link");
    const link = linkNode?.getAttribute("href") || linkNode?.textContent?.trim() || "";
    const summary = node.querySelector("description")?.textContent
      || node.querySelector("summary")?.textContent
      || node.querySelector("content")?.textContent
      || "";
    const publishedAt = node.querySelector("pubDate")?.textContent
      || node.querySelector("published")?.textContent
      || node.querySelector("updated")?.textContent
      || "";
    return normalizeFeedItem(
      {
        title,
        link,
        description: summary,
        pubDate: publishedAt,
      },
      source,
    );
  }).filter(Boolean);
}

async function fetchRssDirect(source) {
  const res = await fetch(source.url, {
    cache: "no-store",
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
    },
  });
  if (!res.ok) throw new Error(`direct: ${res.status}`);
  const xmlText = await res.text();
  if (!xmlText || xmlText.trim().length === 0) throw new Error("rss empty response");
  return parseFeedXml(xmlText, source);
}

async function fetchDailyItemsForSource(source) {
  const items = await fetchRssDirect(source);
  if (items.length === 0) throw new Error("feed empty");
  return items.slice(0, MAX_DAILY_ITEMS_PER_SOURCE);
}

function dedupeDailyItems(items) {
  const seen = new Set();
  const result = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const key = `${item.link}|${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  result.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  return result;
}

function buildDailyFallbackItems() {
  const units = getCoreUnits().slice(0, 16);
  const now = Date.now();
  return units.map((unit, idx) => ({
    type: "daily",
    id: `daily-fallback:${unit.id}`,
    title: `【占位】${unit.title}`,
    summary: unit.summary || "RSS 暂不可用，当前展示核心模块占位内容。",
    scene: unit.scene || "每日新知流",
    mechanisms: unit.mechanisms || [],
    sourceName: "本地占位",
    publishedAt: new Date(now - idx * 600000).toISOString(),
    link: resolveUnitTargetUrl(unit),
    unit,
  }));
}

async function reloadDailyFeed({ silent = false } = {}) {
  state.dailyFeed.loading = true;
  state.dailyFeed.errors = [];
  const diagnostics = new Map();
  const checkedAt = new Date().toISOString();
  const markDiagnostic = (source, classification, reason = "", itemCount = 0) => {
    const sourceId = String(source?.id || "").trim();
    if (!sourceId) return;
    diagnostics.set(sourceId, {
      classification,
      reason,
      checkedAt,
      itemCount: Number(itemCount || 0),
    });
  };
  renderOverviewList();

  const enabledSources = state.appSettings.rssSources.filter((s) => s.enabled && isHttpUrl(s.url));
  const directSources = enabledSources.filter((s) => canFetchSourceDirectly(s));
  const blockedSources = enabledSources.filter((s) => !canFetchSourceDirectly(s));
  const preErrors = blockedSources.map((s) => {
    markDiagnostic(s, "proxy_needed", "当前站点前端直连受限，需后端代理");
    return `${s.name}: 当前站点前端直连受限，需后端代理`;
  });

  if (directSources.length === 0) {
    state.dailyFeed.items = buildDailyFallbackItems();
    state.dailyFeed.loading = false;
    state.dailyFeed.errors = preErrors;
    state.dailyFeed.updatedAt = checkedAt;
    state.rssDiagnostics = diagnostics;
    renderOverviewList();
    renderRssSourceList();
    renderRssColorLegend();
    if (state.engine && state.overviewMode !== OVERVIEW_MODE_CORE) {
      buildEngineAndSeed();
    }
    if (!silent) {
      if (enabledSources.length === 0) {
        showToast("未启用 RSS 源，已使用占位新知流");
      } else {
        showToast("可直连 RSS 源为 0，已使用占位新知流");
      }
    }
    return;
  }

  const jobs = directSources.map((source) => fetchDailyItemsForSource(source)
    .then((items) => ({ ok: true, source, items }))
    .catch((err) => ({ ok: false, source, err })));
  const results = await Promise.all(jobs);

  const merged = [];
  const errors = [...preErrors];
  for (let i = 0; i < results.length; i += 1) {
    const res = results[i];
    if (res.ok) {
      merged.push(...res.items);
      markDiagnostic(res.source, "direct_ok", `抓取成功，条目 ${res.items.length}`, res.items.length);
    } else {
      const reason = res.err?.message || "抓取失败";
      markDiagnostic(res.source, "unavailable", reason, 0);
      const message = `${res.source.name}: ${reason}`;
      errors.push(message);
    }
  }

  const finalItems = dedupeDailyItems(merged).slice(0, MAX_DAILY_ITEMS_TOTAL);
  state.dailyFeed.items = finalItems.length > 0 ? finalItems : buildDailyFallbackItems();
  state.dailyFeed.loading = false;
  state.dailyFeed.errors = errors;
  state.dailyFeed.updatedAt = checkedAt;
  state.rssDiagnostics = diagnostics;
  renderOverviewList();
  renderRssSourceList();
  renderRssColorLegend();

  if (state.engine && state.overviewMode !== OVERVIEW_MODE_CORE) {
    buildEngineAndSeed();
  }

  if (!silent) {
    if (errors.length === 0) {
      showToast(`已更新每日新知流，共 ${state.dailyFeed.items.length} 条`);
    } else {
      showToast(`已更新 ${state.dailyFeed.items.length} 条，${errors.length} 个源失败`);
    }
  }
}

function buildMixedOverviewItems(coreItems, dailyItems) {
  const mixed = [];
  const maxLength = Math.min(180, Math.max(coreItems.length, dailyItems.length) * 2);
  let i = 0;
  while (mixed.length < maxLength && (i < coreItems.length || i < dailyItems.length)) {
    if (i < coreItems.length) {
      mixed.push({
        ...coreItems[i],
        type: "mixed-core",
      });
    }
    if (i < dailyItems.length) {
      mixed.push({
        ...dailyItems[i],
        type: "mixed-daily",
      });
    }
    i += 1;
  }
  return mixed;
}

function buildSavedOverviewItems() {
  const items = Array.isArray(state.savedPool) ? state.savedPool : [];
  if (items.length === 0) return [];

  return items.map((entry, idx) => {
    const normalized = normalizeSavedEntry(entry, idx);
    const savedAt = normalized.savedAt || "";
    if (normalized.kind === "daily") {
      return {
        type: "saved-daily",
        id: `saved-daily:${normalized.id}`,
        savedId: normalized.id,
        savedFingerprint: normalized.fingerprint,
        title: normalized.title,
        summary: normalized.summary,
        scene: normalized.scene || "每日新知流",
        mechanisms: normalized.mechanisms || ["外部优质信息源"],
        sourceName: normalized.sourceName || "RSS",
        sourceId: normalized.sourceId || "rss",
        publishedAt: normalized.publishedAt || "",
        savedAt,
        link: normalized.link || "",
      };
    }

    const fromLibrary = normalized.unitId
      ? state.modelIndex?.items?.find((u) => u.id === normalized.unitId)
      : null;
    const fallbackUnit = {
      id: normalized.unitId || `saved-core-${idx}`,
      slug: normalized.unitId || `saved-core-${idx}`,
      title: normalized.title,
      summary: normalized.summary,
      scene: normalized.scene || "文化与思想实验",
      mechanisms: normalized.mechanisms || [],
      status: "published",
      link: normalized.link || "",
    };
    const unit = fromLibrary || fallbackUnit;
    return {
      type: "saved-core",
      id: `saved-core:${normalized.id}`,
      savedId: normalized.id,
      savedFingerprint: normalized.fingerprint,
      unit,
      unitId: unit.id,
      title: unit.title,
      summary: unit.summary || normalized.summary || "",
      scene: unit.scene || normalized.scene || "",
      mechanisms: unit.mechanisms || normalized.mechanisms || [],
      sourceName: "收藏池",
      publishedAt: "",
      savedAt,
      link: resolveUnitTargetUrl(unit) || normalized.link || "",
    };
  });
}

function getOverviewModeLabel(mode = state.overviewMode) {
  if (mode === OVERVIEW_MODE_CORE) return "核心模块库";
  if (mode === OVERVIEW_MODE_DAILY) return "每日新知流";
  if (mode === OVERVIEW_MODE_SAVED) return "收藏池";
  return "混合";
}

function getOverviewItemsByMode() {
  const coreItems = buildCoreOverviewItems();
  const dailyItems = state.dailyFeed.items || [];
  const savedItems = buildSavedOverviewItems();
  if (state.overviewMode === OVERVIEW_MODE_CORE) return coreItems;
  if (state.overviewMode === OVERVIEW_MODE_DAILY) return dailyItems;
  if (state.overviewMode === OVERVIEW_MODE_SAVED) return savedItems;
  return buildMixedOverviewItems(coreItems, dailyItems);
}

function hslToHex(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const lig = clamp(l, 0, 1);

  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getSourceKeyForItem(item, fallback = "rss") {
  return String(item?.sourceId || item?.sourceName || fallback).trim().toLowerCase();
}

function buildSourceColorMap(items) {
  const keys = [];
  const seen = new Set();
  for (let i = 0; i < items.length; i += 1) {
    const key = getSourceKeyForItem(items[i], `rss-${i}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  keys.sort((a, b) => a.localeCompare(b));

  const colorMap = new Map();
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (i < RSS_SOURCE_PRESET_COLORS.length) {
      colorMap.set(key, RSS_SOURCE_PRESET_COLORS[i]);
      continue;
    }
    // Unlimited source colors: golden-angle hue spread + source-hash jitter.
    const hue = (i * 137.508 + (hashString(key) % 67)) % 360;
    const saturation = 0.66 + ((hashString(`${key}|s`) % 18) / 100);
    const lightness = 0.58 + ((hashString(`${key}|l`) % 10) / 100);
    colorMap.set(key, hslToHex(hue, saturation, lightness));
  }

  return colorMap;
}

function sampleUnitsForCanvas(pool, maxUnits, rng) {
  if (pool.length <= maxUnits) {
    const copy = [...pool];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  const bucketMap = new Map();
  for (let i = 0; i < pool.length; i += 1) {
    const unit = pool[i];
    const key = getSourceKeyForItem(unit, unit?.scene || "core");
    if (!bucketMap.has(key)) bucketMap.set(key, []);
    bucketMap.get(key).push(unit);
  }

  const keys = [...bucketMap.keys()];
  for (let i = keys.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  for (let i = 0; i < keys.length; i += 1) {
    const arr = bucketMap.get(keys[i]);
    for (let j = arr.length - 1; j > 0; j -= 1) {
      const k = Math.floor(rng() * (j + 1));
      [arr[j], arr[k]] = [arr[k], arr[j]];
    }
  }

  const picked = [];
  while (picked.length < maxUnits) {
    let progressed = false;
    for (let i = 0; i < keys.length; i += 1) {
      const arr = bucketMap.get(keys[i]);
      if (!arr || arr.length === 0) continue;
      picked.push(arr.pop());
      progressed = true;
      if (picked.length >= maxUnits) break;
    }
    if (!progressed) break;
  }
  return picked;
}

function mapOverviewItemToCanvasUnit(item, index = 0, sourceColorMap = new Map()) {
  const type = String(item?.type || "");
  const isDailyLike = type === "daily" || type === "mixed-daily" || type === "saved-daily";
  if (isDailyLike) {
    const id = String(item.id || `daily-${index}`);
    const sourceKey = getSourceKeyForItem(item, `rss-${index}`);
    const sourceColor = sourceColorMap.get(sourceKey) || pickSceneColorBySeed(sourceKey);
    return {
      id,
      slug: id,
      title: item.title || "每日新知",
      summary: item.summary || "",
      scene: item.scene || "每日新知流",
      mechanisms: Array.isArray(item.mechanisms) && item.mechanisms.length > 0
        ? item.mechanisms
        : ["网络传播", "随机性"],
      status: "published",
      source_mode: "daily",
      sourceName: item.sourceName || "RSS",
      sourceId: sourceKey,
      source_color: sourceColor,
      link: item.link || "",
      publishedAt: item.publishedAt || "",
    };
  }

  if (item?.unit) return item.unit;

  const coreId = String(item?.id || `core-${index}`);
  return {
    id: coreId,
    slug: coreId,
    title: item?.title || "未命名模块",
    summary: item?.summary || "",
    scene: item?.scene || "文化与思想实验",
    mechanisms: item?.mechanisms || [],
    status: "published",
    link: item?.link || "",
  };
}

function getCanvasUnitPoolByMode() {
  if (state.overviewMode === OVERVIEW_MODE_CORE) {
    return getCoreUnits();
  }

  const items = getOverviewItemsByMode();
  const sourceColorMap = buildSourceColorMap(items);
  const pool = [];
  const seen = new Set();
  for (let i = 0; i < items.length; i += 1) {
    const mapped = mapOverviewItemToCanvasUnit(items[i], i, sourceColorMap);
    if (!mapped || !mapped.id) continue;
    if (seen.has(mapped.id)) continue;
    seen.add(mapped.id);
    pool.push(mapped);
  }
  return pool;
}

function openExternalUrl(url) {
  if (!url) return false;
  try {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  } catch (_err) {
    return false;
  }
}

function buildLayerActiveUnits(rng, maxUnits, focusUnitId = null) {
  if (state.overviewMode !== OVERVIEW_MODE_CORE) {
    const pool = getCanvasUnitPoolByMode();
    if (pool.length > 0) {
      return sampleUnitsForCanvas(pool, Math.min(maxUnits, MAX_CANVAS_UNITS), rng);
    }
    return [];
  }

  const picked = chooseActiveUnits(state.modelIndex.items, rng, maxUnits);
  const focus = pickFocusUnitById(focusUnitId);
  if (!focus) return picked;

  const idx = picked.findIndex((u) => u.id === focus.id);
  if (idx > 0) {
    [picked[0], picked[idx]] = [picked[idx], picked[0]];
    return picked;
  }

  if (idx < 0 && picked.length > 0) {
    picked[picked.length - 1] = focus;
    [picked[0], picked[picked.length - 1]] = [picked[picked.length - 1], picked[0]];
  }

  return picked;
}

function seedRandomCloud(rng) {
  if (!state.engine || state.activeUnits.length === 0) return;

  const area = Math.max(1, state.cols * state.rows);
  const depthBoost = Math.min(0.02, getLayerDepth() * 0.0015);
  const hint = state.layerSeedHint;
  const hintDensity = hint ? clamp(hint.densityBias, 0, 0.08) : 0;
  const density = 0.042 + depthBoost + hintDensity;
  const cloudCount = Math.floor(area * density);
  const preferredOwner = hint && Number.isInteger(hint.owner) ? hint.owner : -1;
  const preferredWeight = hint ? clamp(hint.ownerWeight, 0, 0.92) : 0;

  const pickOwner = () => {
    if (preferredOwner >= 0 && preferredOwner < state.activeUnits.length && rng() < preferredWeight) {
      return preferredOwner;
    }
    return Math.floor(rng() * state.activeUnits.length);
  };

  // Ensure every active unit has at least a tiny presence.
  for (let owner = 0; owner < state.activeUnits.length; owner += 1) {
    const x = Math.floor(rng() * state.cols);
    const y = Math.floor(rng() * state.rows);
    state.engine.setCell(x, y, true, owner);
  }

  for (let i = 0; i < cloudCount; i += 1) {
    const owner = pickOwner();
    const x = Math.floor(rng() * state.cols);
    const y = Math.floor(rng() * state.rows);
    state.engine.setCell(x, y, true, owner);

    // A little local stickiness so the cloud is not pure white noise.
    if (rng() > 0.72) state.engine.setCell(x + 1, y, true, owner);
    if (rng() > 0.78) state.engine.setCell(x, y + 1, true, owner);
    if (rng() > 0.85) state.engine.setCell(x - 1, y, true, owner);
  }
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  state.width = window.innerWidth;
  state.height = window.innerHeight;

  state.canvas.width = Math.floor(state.width * dpr);
  state.canvas.height = Math.floor(state.height * dpr);
  state.canvas.style.width = `${state.width}px`;
  state.canvas.style.height = `${state.height}px`;
  state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  state.cols = Math.max(1, Math.ceil(state.width / state.baseCellSize) + 2);
  state.rows = Math.max(1, Math.ceil(state.height / state.baseCellSize) + 2);

  buildEngineAndSeed();
  resetView(true);
}

function buildEngineAndSeed() {
  if (!state.modelIndex) return;

  const seedKey = getLayerSeedKey();
  const rng = createSeededRng(hashString(seedKey));
  const depth = getLayerDepth();
  const area = Math.max(1, state.cols * state.rows);
  const depthFactor = 1 + Math.min(0.4, depth * 0.08);
  const targetUnits = Math.max(80, Math.floor((area / 700) * depthFactor));
  const poolSize = Math.max(1, getCanvasUnitPoolByMode().length || state.modelIndex.items.length);
  const maxUnits = Math.min(poolSize, targetUnits, MAX_CANVAS_UNITS);
  state.activeUnits = buildLayerActiveUnits(rng, maxUnits, null);

  state.ownerUnitMap.clear();
  state.ownerByUnitId.clear();
  state.activeUnits.forEach((u, idx) => {
    state.ownerUnitMap.set(idx, u);
    state.ownerByUnitId.set(u.id, idx);
  });

  state.engine = new LifeEngine(state.cols, state.rows);
  state.layerBackgroundColor = state.layerSeedHint?.sceneColor || pickSceneColorBySeed(seedKey);

  // V1 choice:
  // Start from multi-color random cloud instead of rigid seed motifs.
  seedRandomCloud(rng);
  state.layerSeedHint = null;

  state.engine.computeNextGeneration();
  state.generationStartTs = performance.now();
  state.generationIndex = 0;
  state.ownerCentroids = state.engine.computeOwnerCentroids(0.5);
  renderOverviewList();
  updateStatusText();
}

function updateStatusText() {
  const visible = state.activeUnits.length;
  ui.statusText.textContent = `画布 L${getLayerDepth()} · 循环 ${state.layerCycle} · 来源 ${getOverviewModeLabel()} · 活跃模块 ${visible} · 第 ${state.generationIndex} 代 · 节奏 ${formatGenerationMs(state.generationMs)} · 视图 ${Math.round(state.zoom * 100)}%`;
}

function drawBackground(ts) {
  const pulse = 0.5 + 0.5 * Math.sin(ts / 2000);
  const focusColor = state.layerBackgroundColor || "#5d8fb8";

  const base0 = hexToRgb("#06101a");
  const base1 = hexToRgb("#0d1b2f");
  const base2 = hexToRgb("#11263b");
  const tintBase = hexToRgb(focusColor);
  const tintDark = shadeRgb(tintBase, 0.5);
  const tintMid = shadeRgb(tintBase, 0.72);
  const tintBright = shadeRgb(tintBase, 0.95);
  const tintStrength = 0.32;

  const c0 = mixRgb(base0, tintDark, tintStrength);
  const c1 = mixRgb(base1, tintMid, tintStrength);
  const c2 = mixRgb(base2, tintBright, tintStrength);

  const g = state.ctx.createLinearGradient(0, 0, state.width, state.height);
  g.addColorStop(0, rgbToCss(c0));
  g.addColorStop(0.55, rgbToCss(c1));
  g.addColorStop(1, rgbToCss(c2));
  state.ctx.fillStyle = g;
  state.ctx.fillRect(0, 0, state.width, state.height);

  const orbA = shadeRgb(tintBright, 1.12);
  const orbB = shadeRgb(tintMid, 0.95);
  state.ctx.globalAlpha = 0.14 + pulse * 0.14;
  state.ctx.fillStyle = rgbToCss(orbA);
  state.ctx.beginPath();
  state.ctx.arc(state.width * 0.2, state.height * 0.24, state.width * (0.14 + pulse * 0.05), 0, Math.PI * 2);
  state.ctx.fill();

  state.ctx.globalAlpha = 0.1 + pulse * 0.11;
  state.ctx.fillStyle = rgbToCss(orbB);
  state.ctx.beginPath();
  state.ctx.arc(state.width * 0.8, state.height * 0.76, state.width * (0.18 + pulse * 0.06), 0, Math.PI * 2);
  state.ctx.fill();

  state.ctx.globalAlpha = 0.07 + pulse * 0.08;
  state.ctx.fillStyle = rgbToCss(shadeRgb(tintBase, 1.06));
  state.ctx.fillRect(0, 0, state.width, state.height);
  state.ctx.globalAlpha = 1;
}

function drawCells(ts) {
  const renderCell = getRenderCellSize();
  const gap = clamp(renderCell * 0.1, 0.2, 1.2);
  const size = Math.max(1, renderCell - gap);
  const breatheBase = 0.82 + 0.24 * Math.sin(ts / 850);
  const childBlend = getChildPreviewBlend(renderCell);

  for (let y = 0; y < state.rows; y += 1) {
    const py = y * renderCell + state.panY;
    if (py > state.height || py + size < 0) continue;

    for (let x = 0; x < state.cols; x += 1) {
      const px = x * renderCell + state.panX;
      if (px > state.width || px + size < 0) continue;
      const dx = Math.abs(x - state.focusCellX);
      const dy = Math.abs(y - state.focusCellY);
      const focusWeight = dx === 0 && dy === 0 ? 1 : (dx <= 1 && dy <= 1 ? 0.38 : 0);

      const alpha = state.engine.getVisibleCellAlpha(x, y, state.progress);
      if (alpha < 0.05) {
        if ((x * 7 + y * 11 + state.generationIndex) % 29 === 0) {
          state.ctx.globalAlpha = 0.06 * breatheBase;
          state.ctx.fillStyle = "#173149";
          state.ctx.fillRect(px, py, size, size);
        }

        if (childBlend > 0.01 && focusWeight > 0) {
          const deadOwner = nearestOwnerFromCentroid(x, y);
          const deadColor = resolveColorForCellHint(x, y, deadOwner);
          drawChildPreviewInCell(px, py, size, deadOwner, x, y, childBlend * focusWeight, deadColor);
        }
        continue;
      }

      const owner = state.engine.getVisibleCellOwner(x, y, state.progress);
      const unit = owner >= 0 ? state.ownerUnitMap.get(owner) : null;
      const color = unit ? (unit.source_color || getSceneColor(unit.scene)) : "#8ea3bf";
      const localBreath = 0.9 + 0.16 * Math.sin(ts / 620 + x * 0.04 + y * 0.06);
      const baseAlphaScale = 1 - childBlend * 0.4 * focusWeight;

      state.ctx.globalAlpha = clamp(alpha * breatheBase * localBreath * 1.16 * baseAlphaScale, 0.05, 1);
      state.ctx.fillStyle = color;
      state.ctx.fillRect(px, py, size, size);

      if (childBlend > 0.01 && focusWeight > 0) {
        const previewColor = owner >= 0 ? color : resolveColorForCellHint(x, y, owner);
        drawChildPreviewInCell(px, py, size, owner, x, y, childBlend * focusWeight, previewColor);
      }

      if (state.darkModeHighContrast) {
        state.ctx.globalAlpha = 0.8;
        state.ctx.strokeStyle = "#07101b";
        state.ctx.strokeRect(px + 0.5, py + 0.5, size, size);
      }
    }
  }
  state.ctx.globalAlpha = 1;
}

function renderFrame(ts) {
  if (!state.engine) {
    requestAnimationFrame(renderFrame);
    return;
  }

  if (state.running) {
    const elapsed = ts - state.generationStartTs;
    state.progress = clamp(elapsed / state.generationMs, 0, 1);

    if (elapsed >= state.generationMs) {
      state.engine.commitNextGeneration();
      state.generationIndex += 1;
      if (state.generationIndex % 4 === 0) {
        applyMicroDisturbance();
      }
      state.engine.computeNextGeneration();
      state.ownerCentroids = state.engine.computeOwnerCentroids(0.5);
      state.generationStartTs = ts;
      state.progress = 0;
      updateStatusText();
    }
  }

  drawBackground(ts);
  drawCells(ts);
  drawLayerTransition(ts);
  requestAnimationFrame(renderFrame);
}

function nearestOwnerFromCentroid(cellX, cellY) {
  let minDist = Infinity;
  let winner = -1;

  for (const [owner, c] of state.ownerCentroids.entries()) {
    const dx = c.x - cellX;
    const dy = c.y - cellY;
    const dist2 = dx * dx + dy * dy;
    if (dist2 < minDist) {
      minDist = dist2;
      winner = owner;
    }
  }

  return winner;
}

function buildLayerSeedHint(cellX, cellY, owner) {
  if (!state.engine) return null;

  const x = clamp(cellX, 0, Math.max(0, state.cols - 1));
  const y = clamp(cellY, 0, Math.max(0, state.rows - 1));
  const alpha = state.engine.getVisibleCellAlpha(x, y, state.progress);
  const alive = alpha >= 0.3;
  const neighbors = state.engine.countNeighbors(x, y).aliveCount;
  const resolvedOwner = owner >= 0 ? owner : nearestOwnerFromCentroid(x, y);
  const sceneColor = resolveColorForCellHint(x, y, resolvedOwner);

  const densityBias = (alive ? 0.03 : 0.01) + neighbors * 0.006;
  const ownerWeight = (alive ? 0.42 : 0.22) + neighbors * 0.045;

  return {
    owner: resolvedOwner,
    sceneColor,
    densityBias: clamp(densityBias, 0.01, 0.08),
    ownerWeight: clamp(ownerWeight, 0.18, 0.92),
  };
}

function resolveEntryCellFromOwner(ownerHint) {
  if (Number.isInteger(ownerHint) && ownerHint >= 0) {
    const c = state.ownerCentroids.get(ownerHint);
    if (c) {
      return {
        x: clamp(Math.round(c.x), 0, Math.max(0, state.cols - 1)),
        y: clamp(Math.round(c.y), 0, Math.max(0, state.rows - 1)),
      };
    }
  }
  return {
    x: Math.floor(state.cols / 2),
    y: Math.floor(state.rows / 2),
  };
}

function enterChildLayer(anchorX = state.width / 2, anchorY = state.height / 2, options = {}) {
  const { silent = false } = options;

  const point = screenToCell(anchorX, anchorY);
  const cellX = clamp(point.x, 0, Math.max(0, state.cols - 1));
  const cellY = clamp(point.y, 0, Math.max(0, state.rows - 1));

  let owner = state.engine.getVisibleCellOwner(cellX, cellY, state.progress);
  if (owner < 0) owner = nearestOwnerFromCentroid(cellX, cellY);
  const unit = owner >= 0 ? state.ownerUnitMap.get(owner) : null;
  state.layerSeedHint = buildLayerSeedHint(cellX, cellY, owner);

  state.layerSlot = state.layerSlot === 0 ? 1 : 0;
  state.layerCycle += 1;

  buildEngineAndSeed();
  resetView(false);

  eventTracker("enter_child_layer", {
    layer_slot: state.layerSlot,
    layer_cycle: state.layerCycle,
    x: cellX,
    y: cellY,
    owner,
    unit_id: unit?.id || "",
  });
  if (!silent) showToast(`进入画布 L${getLayerDepth()} · 循环 ${state.layerCycle}`);
  return true;
}

function enterParentLayer(options = {}) {
  const {
    silent = false,
    anchorX = state.width / 2,
    anchorY = state.height / 2,
    entryZoom = 1,
  } = options;
  if (!canEnterParentLayer()) {
    if (!silent) showToast("当前已是顶层画布");
    return false;
  }

  const center = screenToCell(state.width / 2, state.height / 2);
  let owner = state.engine.getVisibleCellOwner(center.x, center.y, state.progress);
  if (owner < 0) owner = nearestOwnerFromCentroid(center.x, center.y);
  state.layerSeedHint = buildLayerSeedHint(center.x, center.y, owner);

  const fromSlot = state.layerSlot;
  state.layerSlot = state.layerSlot === 0 ? 1 : 0;
  state.layerCycle += 1;
  buildEngineAndSeed();
  const entryCell = resolveEntryCellFromOwner(state.layerSeedHint?.owner ?? owner);
  setViewAroundCell(entryCell.x, entryCell.y, entryZoom, anchorX, anchorY);

  eventTracker("enter_parent_layer", {
    from_slot: fromSlot,
    to_slot: state.layerSlot,
    layer_cycle: state.layerCycle,
    entry_zoom: Number(state.zoom.toFixed(2)),
    entry_cell_x: entryCell.x,
    entry_cell_y: entryCell.y,
  });
  if (!silent) showToast(`回到画布 L${getLayerDepth()} · 循环 ${state.layerCycle}`);
  return true;
}

function applyMicroDisturbance() {
  if (!state.engine || state.ownerCentroids.size === 0) return;

  const seed = hashString(`${getLayerSeedKey()}|kick|${state.generationIndex}`);
  const rng = createSeededRng(seed);
  const owners = [...state.ownerCentroids.entries()];
  const injections = Math.max(4, Math.floor(owners.length * 0.06));

  for (let i = 0; i < injections; i += 1) {
    const [owner, c] = owners[Math.floor(rng() * owners.length)];
    const x = clamp(Math.floor(c.x + (rng() - 0.5) * 12), 0, Math.max(0, state.cols - 1));
    const y = clamp(Math.floor(c.y + (rng() - 0.5) * 12), 0, Math.max(0, state.rows - 1));
    const revive = rng() > 0.62;
    state.engine.setCell(x, y, revive, revive ? owner : -1);
  }
}

function openModelUnit(unit, source = "canvas") {
  if (!unit) return;

  const targetUrl = resolveUnitTargetUrl(unit);
  const sourceLabel = source.startsWith("overview") ? getOverviewModeLabel() : "核心模块库";
  renderUnitPreview(unit, sourceLabel);
  revealCardsAndSchedule();
  showToast(`进入模块：${unit.title}`);

  eventTracker("jump_to_unit", {
    unit_id: unit.id,
    source,
    open_mode: "preview",
    target_url: targetUrl,
  });
}

function openUnit(ownerId, source = "canvas") {
  const unit = state.ownerUnitMap.get(ownerId);
  if (!unit) return;

  if (unit.source_mode === "daily") {
    openDailyItem(
      {
        title: unit.title || "每日新知",
        summary: unit.summary || "",
        link: unit.link || "",
        sourceName: unit.sourceName || "RSS",
        sourceId: unit.sourceId || "",
        publishedAt: unit.publishedAt || "",
        mechanisms: unit.mechanisms || ["外部优质信息源"],
        scene: unit.scene || "每日新知流",
      },
      source,
    );
    return;
  }

  openModelUnit(unit, source);
}

function openDailyItem(item, source = "daily") {
  if (!item) return;
  const link = item.link || "";
  const forcePreview = source === "canvas" || source === "cell_click";
  const shouldDirectJump = !forcePreview && state.appSettings.openMode === "direct";
  if (shouldDirectJump && link) {
    const opened = openExternalUrl(link);
    if (opened) {
      showToast(`已打开新知：${item.title}`);
    } else {
      renderDailyPreview(item);
      showToast("跳转失败，已回退为弹窗预览");
    }
  } else {
    renderDailyPreview(item);
    revealCardsAndSchedule();
    if (shouldDirectJump && !link) {
      showToast(`该条新知暂无链接：${item.title}`);
    } else {
      showToast(`载入新知：${item.title}`);
    }
  }

  eventTracker("open_daily_item", {
    source,
    title: item.title,
    link,
    open_mode: state.appSettings.openMode,
    source_name: item.sourceName || "",
  });
}

async function openUnitModalByOwner(ownerId, source = "cell_double_click") {
  const unit = state.ownerUnitMap.get(ownerId);
  if (!unit) return;

  const title = unit.title || "原文";
  if (unit.source_mode === "daily") {
    const link = unit.link || "";
    const dailyContext = buildPreviewContextFromDailyItem({
      title: unit.title || "每日新知",
      summary: unit.summary || "",
      link,
      sourceName: unit.sourceName || "RSS",
      sourceId: unit.sourceId || "",
      publishedAt: unit.publishedAt || "",
      mechanisms: unit.mechanisms || ["外部优质信息源"],
      scene: unit.scene || "每日新知流",
    });
    if (link) {
      await openContentModal(link, title, { context: dailyContext });
      showToast(`弹窗打开：${title}`);
    } else {
      openDailyItem(
        {
          title: unit.title || "每日新知",
          summary: unit.summary || "",
          link: "",
          sourceName: unit.sourceName || "RSS",
          publishedAt: unit.publishedAt || "",
          sourceId: unit.sourceId || "",
        },
        source,
      );
      showToast("该条新知暂无原文链接，已展示预览");
    }
    eventTracker("open_unit_modal", {
      source,
      unit_id: unit.id,
      unit_mode: "daily",
      link,
    });
    return;
  }

  const targetUrl = resolveUnitTargetUrl(unit) || unit.link || "";
  if (targetUrl) {
    await openContentModal(targetUrl, title, { context: buildPreviewContextFromUnit(unit) });
    showToast(`弹窗打开：${title}`);
  } else {
    openModelUnit(unit, source);
    showToast("当前模块没有可嵌入的原文地址，已展示预览");
  }
  eventTracker("open_unit_modal", {
    source,
    unit_id: unit.id,
    unit_mode: "core",
    link: targetUrl,
  });
}

async function openOverviewItem(item) {
  if (!item) return;
  const type = String(item.type || "");
  const isDaily = type === "daily" || type === "mixed-daily" || type === "saved-daily";
  closeOverview();
  if (isDaily) {
    const link = item.link || "";
    if (link) {
      await openContentModal(link, item.title || "每日新知原文", {
        context: buildPreviewContextFromDailyItem(item),
      });
    } else {
      openDailyItem(item, "overview_daily");
      showToast("该条新知暂无原文链接，已展示预览");
    }
    return;
  }

  const unit = item.unit || state.modelIndex?.items?.find((u) => u.id === item.unitId);
  if (!unit) return;
  const targetUrl = resolveUnitTargetUrl(unit) || item.link || "";
  if (targetUrl) {
    await openContentModal(targetUrl, unit.title || item.title || "模块原文", {
      context: buildPreviewContextFromUnit(unit),
    });
  } else {
    openModelUnit(unit, "overview_core");
  }
}

function resolveCanvasHit(ev) {
  if (!state.engine) return null;
  const rect = state.canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  const point = screenToCell(x, y);
  const cellX = point.x;
  const cellY = point.y;
  if (cellX < 0 || cellY < 0 || cellX >= state.cols || cellY >= state.rows) {
    return null;
  }
  const alpha = state.engine.getVisibleCellAlpha(cellX, cellY, state.progress);
  const owner = alpha >= 0.3 ? state.engine.getVisibleCellOwner(cellX, cellY, state.progress) : -1;
  return {
    cellX,
    cellY,
    alpha,
    owner,
    alive: alpha >= 0.3,
  };
}

function onCanvasClick(ev) {
  if (state.transition.active) return;

  if (state.suppressClick) {
    state.suppressClick = false;
    return;
  }

  const hit = resolveCanvasHit(ev);
  if (!hit) return;

  if (hit.alive && hit.owner >= 0) {
    eventTracker("cell_click", { x: hit.cellX, y: hit.cellY, hit: true });
    openUnit(hit.owner, "cell_click");
    return;
  }

  eventTracker("cell_click", { x: hit.cellX, y: hit.cellY, hit: false });
  const fallbackOwner = nearestOwnerFromCentroid(hit.cellX, hit.cellY);
  if (fallbackOwner >= 0) {
    const unit = state.ownerUnitMap.get(fallbackOwner);
    showToast(`这里是死细胞，最近活跃模块：${unit.title}`);
  } else {
    showToast("当前附近无活跃模块，请稍后再试");
  }
}

async function onCanvasDoubleClick(ev) {
  if (state.transition.active) return;
  if (state.suppressClick) {
    state.suppressClick = false;
    return;
  }
  ev.preventDefault();
  const hit = resolveCanvasHit(ev);
  if (!hit) return;

  const owner = hit.alive && hit.owner >= 0
    ? hit.owner
    : nearestOwnerFromCentroid(hit.cellX, hit.cellY);
  if (owner < 0) {
    showToast("当前附近无可打开模块");
    return;
  }

  eventTracker("cell_dblclick", { x: hit.cellX, y: hit.cellY, owner });
  await openUnitModalByOwner(owner, "cell_dblclick");
}

function onCanvasWheel(ev) {
  ev.preventDefault();
  if (state.transition.active) return;

  const rect = state.canvas.getBoundingClientRect();
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;
  const focus = screenToCell(sx, sy);
  state.focusCellX = focus.x;
  state.focusCellY = focus.y;
  const zoomIn = ev.deltaY < 0;
  const factor = zoomIn ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR;

  const rawZoom = state.zoom * factor;
  if (!zoomIn && canEnterParentLayer() && rawZoom < state.minZoom * PARENT_ENTRY_ZOOM) {
    startLayerTransition("parent", sx, sy);
    return;
  }

  setZoom(rawZoom, sx, sy);
  maybeAutoLayerTransition(zoomIn, sx, sy);
}

function onCanvasPointerDown(ev) {
  if (state.transition.active) return;
  if (ev.button !== 0) return;

  state.isDragging = true;
  state.dragPointerId = ev.pointerId;
  state.dragLastX = ev.clientX;
  state.dragLastY = ev.clientY;
  state.draggedDistance = 0;
  state.canvas.style.cursor = "grabbing";
  state.canvas.setPointerCapture(ev.pointerId);
}

function onCanvasPointerMove(ev) {
  if (!state.isDragging || ev.pointerId !== state.dragPointerId) return;

  const dx = ev.clientX - state.dragLastX;
  const dy = ev.clientY - state.dragLastY;
  state.dragLastX = ev.clientX;
  state.dragLastY = ev.clientY;
  state.draggedDistance += Math.abs(dx) + Math.abs(dy);

  state.panX += dx;
  state.panY += dy;
  clampPan();
}

function onCanvasPointerEnd(ev) {
  if (!state.isDragging || ev.pointerId !== state.dragPointerId) return;

  state.isDragging = false;
  state.dragPointerId = null;
  if (state.draggedDistance > 6) {
    state.suppressClick = true;
  }
  state.draggedDistance = 0;
  state.canvas.style.cursor = "grab";
  try {
    state.canvas.releasePointerCapture(ev.pointerId);
  } catch (_err) {
    // ignore release errors for canceled pointers
  }
}

function renderRssColorLegend() {
  const targets = [ui.rssColorLegend, ui.rssColorLegendInline].filter(Boolean);
  if (targets.length === 0) return;

  const seedItems = (state.dailyFeed.items && state.dailyFeed.items.length > 0)
    ? state.dailyFeed.items
    : (state.appSettings.rssSources || []).filter((s) => s.enabled).map((s) => ({
      sourceId: s.id,
      sourceName: s.name,
    }));

  if (!seedItems || seedItems.length === 0) {
    for (let i = 0; i < targets.length; i += 1) {
      targets[i].innerHTML = `<div class="overview-empty">暂无 RSS 源</div>`;
    }
    return;
  }

  const colorMap = buildSourceColorMap(seedItems);
  const labelMap = new Map();
  for (let i = 0; i < seedItems.length; i += 1) {
    const item = seedItems[i];
    const key = getSourceKeyForItem(item, `rss-${i}`);
    if (!labelMap.has(key)) {
      labelMap.set(key, item.sourceName || item.name || key);
    }
  }
  const pairs = [...labelMap.entries()];
  pairs.sort((a, b) => String(a[1]).localeCompare(String(b[1]), "zh-CN"));

  const markup = pairs
    .map(([key, name]) => {
      const color = colorMap.get(key) || "#95a3bc";
      return `<div class="legend-row"><span class="dot" style="background:${color}"></span><span>${escapeHtml(name)}</span></div>`;
    })
    .join("");
  for (let i = 0; i < targets.length; i += 1) {
    targets[i].innerHTML = markup;
  }
}

function renderLegendPanel() {
  const rows = Object.entries(SCENE_COLORS)
    .map(([scene, color]) => `<div class="legend-row"><span class="dot" style="background:${color}"></span><span>${scene}</span></div>`)
    .join("");

  ui.legendPanel.querySelector(".legend-content").innerHTML = rows;
  renderRssColorLegend();
}

function renderOverviewList() {
  const query = (ui.searchInput.value || "").trim().toLowerCase();
  const items = getOverviewItemsByMode();
  const list = items.filter((item) => {
    if (!query) return true;
    const mechanismsText = Array.isArray(item.mechanisms) ? item.mechanisms.join(" ") : "";
    return (
      String(item.title || "").toLowerCase().includes(query)
      || String(item.scene || "").toLowerCase().includes(query)
      || mechanismsText.toLowerCase().includes(query)
      || String(item.sourceName || "").toLowerCase().includes(query)
    );
  });
  const visibleList = list.slice(0, OVERVIEW_RENDER_LIMIT);
  if (state.overviewMode === OVERVIEW_MODE_SAVED) {
    pruneSavedSelection();
    state.savedVisibleIds = visibleList
      .map((item) => String(item.savedId || "").trim())
      .filter(Boolean);
  } else {
    state.savedVisibleIds = [];
  }

  const modeLabel = getOverviewModeLabel();
  const updatedAt = formatDateTime(state.dailyFeed.updatedAt);
  const loadingText = state.dailyFeed.loading ? "正在更新 RSS..." : "";
  const errorText = state.dailyFeed.errors.length > 0 ? `，失败源 ${state.dailyFeed.errors.length}` : "";
  const capText = list.length > visibleList.length ? `，显示前 ${visibleList.length} 条` : "";
  if (state.overviewMode === OVERVIEW_MODE_DAILY || state.overviewMode === OVERVIEW_MODE_MIXED) {
    ui.overviewMeta.textContent = `${modeLabel} · 共 ${list.length} 条${capText} · ${loadingText || (updatedAt ? `更新于 ${updatedAt}${errorText}` : "等待首次加载")}`;
  } else {
    ui.overviewMeta.textContent = `${modeLabel} · 共 ${list.length} 条${capText}`;
  }

  ui.overviewList.innerHTML = "";
  if (visibleList.length === 0) {
    const empty = document.createElement("div");
    empty.className = "overview-empty";
    if (state.overviewMode === OVERVIEW_MODE_DAILY && state.dailyFeed.loading) {
      empty.textContent = "正在拉取每日新知流，请稍候...";
    } else if (state.overviewMode === OVERVIEW_MODE_DAILY) {
      empty.textContent = "当前没有可展示的新知条目，请先在设置里配置并启用 RSS 源。";
    } else if (state.overviewMode === OVERVIEW_MODE_SAVED) {
      empty.textContent = "收藏池为空。先点击画布里的细胞，再点“保存这个细胞到收藏池”。";
    } else {
      empty.textContent = "没有匹配结果，试试更短的关键词。";
    }
    ui.overviewList.appendChild(empty);
    syncSavedBatchUi();
    return;
  }

  for (let i = 0; i < visibleList.length; i += 1) {
    const item = visibleList[i];
    const row = document.createElement("button");
    row.className = "overview-item";
    row.type = "button";
    const type = String(item.type || "");
    const isDaily = type === "daily" || type === "mixed-daily" || type === "saved-daily";
    const isSaved = type.startsWith("saved-");
    const batchMode = isSaved && state.savedBatchMode;
    const isSelected = batchMode && item.savedId && state.savedSelection.has(item.savedId);
    const pillClass = isSaved
      ? "pill-saved"
      : (type === "core" ? "pill-core" : (isDaily ? "pill-daily" : "pill-mixed"));
    const timeValue = formatDateTime(item.publishedAt || item.savedAt);
    const sub = isDaily
      ? `${item.sourceName || "RSS"} · ${timeValue || "未知时间"}`
      : `${item.scene || "未分类"} · ${formatMechanisms(item.mechanisms)}`;
    const summary = shortText(item.summary || "", 72);
    const modeForItem = isSaved
      ? OVERVIEW_MODE_SAVED
      : ((type === "mixed-daily" || type === "mixed-core")
      ? OVERVIEW_MODE_MIXED
      : (isDaily ? OVERVIEW_MODE_DAILY : OVERVIEW_MODE_CORE));
    const modeLabel = getOverviewModeLabel(modeForItem);
    const selectMarkup = batchMode
      ? `<span class="overview-select"><input data-saved-select="1" type="checkbox" ${isSelected ? "checked" : ""} aria-label="选择此收藏" /></span>`
      : "";
    const removeMarkup = isSaved && !batchMode
      ? `<span class="overview-remove" data-saved-remove="1" title="从收藏池删除">删除</span>`
      : "";
    row.classList.toggle("is-batch-mode", batchMode);
    row.innerHTML = `
      ${selectMarkup}
      <span class="overview-title">${escapeHtml(item.title || "未命名条目")}</span>
      <span class="overview-sub">${escapeHtml(sub)}</span>
      <span class="overview-sub">${escapeHtml(summary)}</span>
      <span class="overview-tags">
        <span class="pill ${pillClass}">${escapeHtml(modeLabel)}</span>
        ${removeMarkup}
      </span>
    `;
    row.addEventListener("click", (ev) => {
      if (isSaved && batchMode) {
        ev.preventDefault();
        ev.stopPropagation();
        const checkboxHit = ev.target?.closest?.("[data-saved-select='1']");
        if (checkboxHit) {
          setSavedSelection(item.savedId, !!checkboxHit.checked);
          return;
        }
        const nextSelected = !state.savedSelection.has(item.savedId);
        setSavedSelection(item.savedId, nextSelected);
        renderOverviewList();
        return;
      }

      const removeHit = ev.target?.closest?.("[data-saved-remove='1']");
      if (removeHit && isSaved) {
        ev.preventDefault();
        ev.stopPropagation();
        const removed = removeSavedEntryById(item.savedId);
        if (!removed.removed) {
          showToast("删除失败：未找到该收藏");
          return;
        }
        if (state.previewContext?.kind === "daily" && state.previewContext?.item?.link === item.link) {
          state.previewContext = null;
        }
        if (state.contentModalContext?.kind === "daily" && state.contentModalContext?.item?.link === item.link) {
          state.contentModalContext = null;
          syncContentModalSaveButton();
        }
        state.savedSelection.delete(String(item.savedId || ""));
        showToast(`已删除收藏：${removed.entry?.title || "未命名条目"}`);
        renderOverviewList();
        if (state.engine && state.overviewMode === OVERVIEW_MODE_SAVED) {
          buildEngineAndSeed();
        }
        return;
      }

      openOverviewItem(item).catch(() => {
        showToast("打开失败，请稍后重试");
      });
    });
    ui.overviewList.appendChild(row);
  }
  syncSavedBatchUi();
}

function getRecommendedRssSources() {
  const merged = [...DEFAULT_RSS_SOURCES, ...RECOMMENDED_RSS_SOURCES];
  const deduped = [];
  const seen = new Set();
  for (let i = 0; i < merged.length; i += 1) {
    const raw = merged[i];
    const normalized = normalizeRssSource(
      {
        id: `recommended-${hashString(`${raw.name}|${raw.url}`)}`,
        name: raw.name,
        url: raw.url,
        enabled: true,
      },
      i,
    );
    const key = String(normalized.url || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped;
}

function addRssSourceIfNotExists(source, { prepend = false } = {}) {
  const normalized = normalizeRssSource(source, (state.appSettings.rssSources || []).length);
  const urlKey = String(normalized.url || "").trim().toLowerCase();
  if (!urlKey || !isHttpUrl(normalized.url)) {
    return { added: false, reason: "invalid" };
  }
  const exists = (state.appSettings.rssSources || [])
    .some((s) => String(s.url || "").trim().toLowerCase() === urlKey);
  if (exists) return { added: false, reason: "duplicate" };

  if (!Array.isArray(state.appSettings.rssSources)) {
    state.appSettings.rssSources = [];
  }
  if (prepend) {
    state.appSettings.rssSources.unshift(normalized);
  } else {
    state.appSettings.rssSources.push(normalized);
  }
  return { added: true, source: normalized };
}

function getRssStatusForSource(source) {
  const sourceId = String(source?.id || "").trim();
  if (sourceId && state.rssDiagnostics.has(sourceId)) {
    const hit = state.rssDiagnostics.get(sourceId);
    return {
      classification: hit.classification || "unknown",
      label: RSS_STATUS_LABEL[hit.classification] || RSS_STATUS_LABEL.unknown,
      reason: hit.reason || "",
      checkedAt: hit.checkedAt || "",
      itemCount: Number(hit.itemCount || 0),
    };
  }

  const url = String(source?.url || "").trim();
  if (!isHttpUrl(url)) {
    return {
      classification: "unavailable",
      label: RSS_STATUS_LABEL.unavailable,
      reason: "URL 非法",
      checkedAt: "",
      itemCount: 0,
    };
  }

  let protocol = "";
  try {
    protocol = new URL(url).protocol || "";
  } catch (_err) {
    protocol = "";
  }
  if (protocol && protocol !== "https:") {
    return {
      classification: "proxy_needed",
      label: RSS_STATUS_LABEL.proxy_needed,
      reason: "HTTP 源在 HTTPS 页面会受限",
      checkedAt: "",
      itemCount: 0,
    };
  }

  if (!canFetchSourceDirectly(source)) {
    return {
      classification: "proxy_needed",
      label: RSS_STATUS_LABEL.proxy_needed,
      reason: "当前前端直连受限",
      checkedAt: "",
      itemCount: 0,
    };
  }

  return {
    classification: "unknown",
    label: RSS_STATUS_LABEL.unknown,
    reason: source?.enabled ? "等待刷新检测" : "源已停用",
    checkedAt: "",
    itemCount: 0,
  };
}

function getFilteredRssSourceItems() {
  const sources = Array.isArray(state.appSettings.rssSources) ? state.appSettings.rssSources : [];
  const query = String(state.rssManageQuery || "").trim().toLowerCase();
  const filter = String(state.rssManageFilter || "all");

  const mapped = sources.map((source) => {
    const status = getRssStatusForSource(source);
    const host = getHostFromUrl(source.url || "").replace(/^www\./, "");
    return { source, status, host };
  });

  return mapped.filter((item) => {
    if (query) {
      const hit = String(item.source.name || "").toLowerCase().includes(query)
        || String(item.source.url || "").toLowerCase().includes(query)
        || String(item.host || "").toLowerCase().includes(query);
      if (!hit) return false;
    }

    if (filter === "all") return true;
    if (filter === "enabled") return !!item.source.enabled;
    if (filter === "disabled") return !item.source.enabled;
    return item.status.classification === filter;
  });
}

function renderRssRecommendedList() {
  if (!ui.rssRecommendedList) return;
  ui.rssRecommendedList.innerHTML = "";
  const recommended = getRecommendedRssSources();
  const existing = new Set(
    (state.appSettings.rssSources || [])
      .map((s) => String(s.url || "").trim().toLowerCase()),
  );

  if (recommended.length === 0) {
    const empty = document.createElement("div");
    empty.className = "overview-empty";
    empty.textContent = "暂无推荐源";
    ui.rssRecommendedList.appendChild(empty);
    if (ui.rssAddRecommendedBtn) ui.rssAddRecommendedBtn.disabled = true;
    return;
  }

  let addableCount = 0;
  for (let i = 0; i < recommended.length; i += 1) {
    const source = recommended[i];
    const urlKey = String(source.url || "").trim().toLowerCase();
    const added = existing.has(urlKey);
    if (!added) addableCount += 1;

    const host = getHostFromUrl(source.url || "").replace(/^www\./, "");
    const row = document.createElement("div");
    row.className = "rss-recommended-item";
    row.innerHTML = `
      <div class="rss-recommended-main">
        <span class="rss-recommended-name">${escapeHtml(source.name || host || "未命名源")}</span>
        <span class="rss-recommended-url">${escapeHtml(host || source.url)}</span>
      </div>
      <button type="button" class="mini-btn" ${added ? "disabled" : ""}>${added ? "已添加" : "添加"}</button>
    `;
    const addBtn = row.querySelector("button");
    addBtn.addEventListener("click", async () => {
      const result = addRssSourceIfNotExists(source, { prepend: true });
      if (!result.added) return;
      saveAppSettings();
      renderRssSourceList();
      renderRssColorLegend();
      await reloadDailyFeed({ silent: true });
      showToast(`已添加推荐源：${source.name}`);
    });
    ui.rssRecommendedList.appendChild(row);
  }

  if (ui.rssAddRecommendedBtn) {
    ui.rssAddRecommendedBtn.disabled = addableCount === 0;
  }
}

function renderRssSourceList() {
  ui.rssSourceList.innerHTML = "";
  renderRssRecommendedList();
  const sources = state.appSettings.rssSources || [];

  const filtered = getFilteredRssSourceItems();
  const totalCount = sources.length;
  const enabledCount = sources.filter((s) => s.enabled).length;
  const counts = {
    direct_ok: 0,
    proxy_needed: 0,
    unavailable: 0,
    unknown: 0,
  };
  for (let i = 0; i < sources.length; i += 1) {
    const status = getRssStatusForSource(sources[i]);
    const key = status.classification || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }

  if (ui.rssSourceMeta) {
    ui.rssSourceMeta.textContent = `显示 ${filtered.length}/${totalCount} · 启用 ${enabledCount} · 可直连 ${counts.direct_ok} · 需代理 ${counts.proxy_needed} · 不可用 ${counts.unavailable} · 待检测 ${counts.unknown}`;
  }

  if (ui.rssEnableFilteredBtn) ui.rssEnableFilteredBtn.disabled = filtered.length === 0;
  if (ui.rssDisableFilteredBtn) ui.rssDisableFilteredBtn.disabled = filtered.length === 0;
  if (ui.rssDeleteFilteredBtn) ui.rssDeleteFilteredBtn.disabled = filtered.length === 0;

  if (totalCount === 0) {
    const empty = document.createElement("div");
    empty.className = "overview-empty";
    empty.textContent = "暂无 RSS 源，点击上方输入框添加。";
    ui.rssSourceList.appendChild(empty);
    renderRssColorLegend();
    return;
  }

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "overview-empty";
    empty.textContent = "当前筛选没有匹配的源。";
    ui.rssSourceList.appendChild(empty);
    renderRssColorLegend();
    return;
  }

  for (let i = 0; i < filtered.length; i += 1) {
    const item = filtered[i];
    const source = item.source;
    const status = item.status;
    const statusLabel = status.label || RSS_STATUS_LABEL.unknown;
    const statusReason = status.reason || "";
    const checkedText = status.checkedAt ? ` · ${formatDateTime(status.checkedAt)}` : "";
    const row = document.createElement("div");
    row.className = "rss-source-item";
    row.innerHTML = `
      <div class="rss-main">
        <input type="checkbox" ${source.enabled ? "checked" : ""} />
        <span class="rss-name">${escapeHtml(source.name || "未命名源")}</span>
      </div>
      <div class="rss-actions">
        <span class="rss-status-pill is-${escapeHtml(status.classification || "unknown")}">${escapeHtml(statusLabel)}</span>
        <button class="rss-delete" type="button">删除</button>
      </div>
      <div class="rss-url">${escapeHtml(source.url)}</div>
      <div class="rss-status-detail">${escapeHtml(statusReason)}${escapeHtml(checkedText)}</div>
    `;

    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.addEventListener("change", async (e) => {
      const next = !!e.target.checked;
      source.enabled = next;
      saveAppSettings();
      renderRssSourceList();
      await reloadDailyFeed({ silent: true });
      renderOverviewList();
    });

    const deleteBtn = row.querySelector(".rss-delete");
    deleteBtn.addEventListener("click", async () => {
      state.appSettings.rssSources = state.appSettings.rssSources.filter((s) => s.id !== source.id);
      saveAppSettings();
      renderRssSourceList();
      await reloadDailyFeed({ silent: true });
      showToast(`已删除 RSS 源：${source.name}`);
    });

    ui.rssSourceList.appendChild(row);
  }
  renderRssColorLegend();
}

function bindUI() {
  ui.speedInput.addEventListener("input", () => {
    const value = Number(ui.speedInput.value);
    setGenerationMs(value);
    eventTracker("canvas_speed_change", { generation_ms: value });
  });

  ui.zoomInput.addEventListener("input", () => {
    if (state.transition.active) return;
    const focus = screenToCell(state.width / 2, state.height / 2);
    state.focusCellX = focus.x;
    state.focusCellY = focus.y;
    const percent = Number(ui.zoomInput.value);
    const prevZoom = state.zoom;
    setZoom(percent / 100);
    if (state.zoom > prevZoom) {
      maybeAutoLayerTransition(true, state.width / 2, state.height / 2);
    } else if (state.zoom < prevZoom) {
      maybeAutoLayerTransition(false, state.width / 2, state.height / 2);
    }
    eventTracker("canvas_zoom_change", { zoom: Number(state.zoom.toFixed(2)), source: "slider" });
  });

  ui.resetViewBtn.addEventListener("click", () => {
    resetView(false);
    showToast("视图已重置");
  });

  ui.legendBtn.addEventListener("click", () => {
    ui.legendPanel.classList.toggle("open");
  });

  ui.fullscreenBtn.addEventListener("click", async () => {
    await toggleFullscreen();
  });

  ui.overviewBtn.addEventListener("click", () => {
    toggleOverview();
    eventTracker("open_overview", { open: ui.overviewDrawer.classList.contains("open") });
  });
  ui.settingsBtn.addEventListener("click", () => {
    toggleSettings();
    eventTracker("open_settings", { open: ui.settingsDrawer.classList.contains("open") });
  });

  ui.overviewClose.addEventListener("click", closeOverview);
  ui.settingsClose.addEventListener("click", closeSettings);
  ui.overviewBackdrop.addEventListener("click", closeAllPanels);
  ui.contentModalClose.addEventListener("click", closeContentModal);
  if (ui.contentModalZoomOut) {
    ui.contentModalZoomOut.addEventListener("click", () => {
      adjustContentModalScale("out");
    });
  }
  if (ui.contentModalZoomIn) {
    ui.contentModalZoomIn.addEventListener("click", () => {
      adjustContentModalScale("in");
    });
  }
  if (ui.contentModalZoomReset) {
    ui.contentModalZoomReset.addEventListener("click", () => {
      adjustContentModalScale("reset");
    });
  }
  if (ui.contentModalSave) {
    ui.contentModalSave.addEventListener("click", () => {
      saveCurrentModalCell();
    });
  }
  ui.contentModalBackdrop.addEventListener("click", closeContentModal);

  ui.tabCore.addEventListener("click", () => {
    setOverviewMode(OVERVIEW_MODE_CORE);
  });
  ui.tabDaily.addEventListener("click", () => {
    setOverviewMode(OVERVIEW_MODE_DAILY);
  });
  ui.tabMixed.addEventListener("click", () => {
    setOverviewMode(OVERVIEW_MODE_MIXED);
  });
  if (ui.tabSaved) {
    ui.tabSaved.addEventListener("click", () => {
      setOverviewMode(OVERVIEW_MODE_SAVED);
    });
  }

  if (ui.savedManualAddBtn) {
    ui.savedManualAddBtn.addEventListener("click", () => {
      addManualUrlToSavedPool();
    });
  }
  if (ui.savedBatchToggleBtn) {
    ui.savedBatchToggleBtn.addEventListener("click", () => {
      setSavedBatchMode(!state.savedBatchMode);
    });
  }
  if (ui.savedSelectAllBtn) {
    ui.savedSelectAllBtn.addEventListener("click", () => {
      if (!state.savedBatchMode) {
        state.savedBatchMode = true;
      }
      for (let i = 0; i < state.savedVisibleIds.length; i += 1) {
        const id = String(state.savedVisibleIds[i] || "").trim();
        if (id) state.savedSelection.add(id);
      }
      renderOverviewList();
    });
  }
  if (ui.savedClearSelectionBtn) {
    ui.savedClearSelectionBtn.addEventListener("click", () => {
      state.savedSelection.clear();
      renderOverviewList();
    });
  }
  if (ui.savedDeleteSelectedBtn) {
    ui.savedDeleteSelectedBtn.addEventListener("click", () => {
      deleteSelectedSavedEntries();
    });
  }
  if (ui.savedManualUrl) {
    ui.savedManualUrl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addManualUrlToSavedPool();
      }
    });
  }
  if (ui.savedManualTitle) {
    ui.savedManualTitle.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addManualUrlToSavedPool();
      }
    });
  }

  ui.searchInput.addEventListener("input", () => {
    renderOverviewList();
  });

  ui.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      eventTracker("search_submit", { query: ui.searchInput.value || "" });
    }
  });

  ui.unitPreviewBody.addEventListener("click", async (e) => {
    const saveTrigger = e.target?.closest?.("[data-preview-save='1']");
    if (saveTrigger) {
      e.preventDefault();
      saveCurrentPreviewCell();
      return;
    }

    const trigger = e.target?.closest?.("[data-inline-open='1']");
    if (!trigger) return;
    e.preventDefault();
    const url = trigger.getAttribute("data-url") || "";
    const title = trigger.getAttribute("data-title") || "原文";
    await openContentModal(url, title, { context: state.previewContext });
  });

  ui.openModePreview.addEventListener("change", () => {
    if (!ui.openModePreview.checked) return;
    state.appSettings.openMode = "preview";
    saveAppSettings();
    showToast("已切换为弹窗预览（新知流）");
  });
  ui.openModeDirect.addEventListener("change", () => {
    if (!ui.openModeDirect.checked) return;
    state.appSettings.openMode = "direct";
    saveAppSettings();
    showToast("已切换为直接跳转（新知流）");
  });

  if (ui.rssOpmlBtn && ui.rssOpmlInput) {
    ui.rssOpmlBtn.addEventListener("click", () => {
      ui.rssOpmlInput.click();
    });
    ui.rssOpmlInput.addEventListener("change", async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = parseOpmlSources(text);
        if (imported.length === 0) {
          showToast("未在 OPML 中识别到可用 RSS 源");
          return;
        }
        const { added, skipped } = mergeImportedRssSources(imported);
        saveAppSettings();
        renderRssSourceList();
        renderRssColorLegend();
        await reloadDailyFeed({ silent: true });
        showToast(`OPML 导入完成：新增 ${added}，跳过 ${skipped}`);
      } catch (_err) {
        showToast("OPML 导入失败，请检查文件格式");
      } finally {
        ui.rssOpmlInput.value = "";
      }
    });
  }

  if (ui.rssManageSearchInput) {
    ui.rssManageSearchInput.value = state.rssManageQuery || "";
    ui.rssManageSearchInput.addEventListener("input", () => {
      state.rssManageQuery = ui.rssManageSearchInput.value || "";
      renderRssSourceList();
    });
  }
  if (ui.rssManageFilter) {
    ui.rssManageFilter.value = state.rssManageFilter || "all";
    ui.rssManageFilter.addEventListener("change", () => {
      state.rssManageFilter = ui.rssManageFilter.value || "all";
      renderRssSourceList();
    });
  }

  const applyRssBatchAction = async (action) => {
    const filtered = getFilteredRssSourceItems();
    if (filtered.length === 0) {
      showToast("当前筛选没有可操作的 RSS 源");
      return;
    }

    let changed = 0;
    if (action === "enable") {
      for (let i = 0; i < filtered.length; i += 1) {
        const source = filtered[i].source;
        if (!source.enabled) {
          source.enabled = true;
          changed += 1;
        }
      }
      if (changed === 0) {
        showToast("当前筛选中的源已全部启用");
        return;
      }
    } else if (action === "disable") {
      for (let i = 0; i < filtered.length; i += 1) {
        const source = filtered[i].source;
        if (source.enabled) {
          source.enabled = false;
          changed += 1;
        }
      }
      if (changed === 0) {
        showToast("当前筛选中的源已全部停用");
        return;
      }
    } else if (action === "delete") {
      const ok = window.confirm(`确认删除当前筛选的 ${filtered.length} 个 RSS 源吗？`);
      if (!ok) return;
      const removeIds = new Set(filtered.map((item) => String(item.source.id || "").trim()).filter(Boolean));
      const before = state.appSettings.rssSources.length;
      state.appSettings.rssSources = state.appSettings.rssSources.filter(
        (source) => !removeIds.has(String(source.id || "").trim()),
      );
      changed = before - state.appSettings.rssSources.length;
      if (changed <= 0) {
        showToast("没有删除任何 RSS 源");
        return;
      }
    }

    saveAppSettings();
    renderRssSourceList();
    renderRssColorLegend();
    await reloadDailyFeed({ silent: true });
    renderOverviewList();
    if (action === "enable") showToast(`已批量启用 ${changed} 个 RSS 源`);
    if (action === "disable") showToast(`已批量停用 ${changed} 个 RSS 源`);
    if (action === "delete") showToast(`已批量删除 ${changed} 个 RSS 源`);
  };

  if (ui.rssEnableFilteredBtn) {
    ui.rssEnableFilteredBtn.addEventListener("click", async () => {
      await applyRssBatchAction("enable");
    });
  }
  if (ui.rssDisableFilteredBtn) {
    ui.rssDisableFilteredBtn.addEventListener("click", async () => {
      await applyRssBatchAction("disable");
    });
  }
  if (ui.rssDeleteFilteredBtn) {
    ui.rssDeleteFilteredBtn.addEventListener("click", async () => {
      await applyRssBatchAction("delete");
    });
  }
  if (ui.rssAddRecommendedBtn) {
    ui.rssAddRecommendedBtn.addEventListener("click", async () => {
      const recommended = getRecommendedRssSources();
      let added = 0;
      for (let i = 0; i < recommended.length; i += 1) {
        const result = addRssSourceIfNotExists(recommended[i], { prepend: false });
        if (result.added) added += 1;
      }
      if (added === 0) {
        showToast("推荐位中的源都已存在");
        return;
      }
      saveAppSettings();
      renderRssSourceList();
      renderRssColorLegend();
      await reloadDailyFeed({ silent: true });
      showToast(`已添加 ${added} 个推荐 RSS 源`);
    });
  }

  ui.rssAddBtn.addEventListener("click", async () => {
    const name = (ui.rssNameInput.value || "").trim();
    const url = normalizePath((ui.rssUrlInput.value || "").trim());
    if (!name) {
      showToast("请输入 RSS 源名称");
      return;
    }
    if (!isHttpUrl(url)) {
      showToast("请输入合法的 RSS 地址（http/https）");
      return;
    }

    const addResult = addRssSourceIfNotExists(
      {
        id: `rss-${hashString(`${name}|${url}|${Date.now()}`)}`,
        name,
        url,
        enabled: true,
      },
      { prepend: true },
    );
    if (!addResult.added) {
      showToast("该 RSS 源已存在或地址无效");
      return;
    }
    saveAppSettings();
    renderRssSourceList();
    renderRssColorLegend();
    ui.rssNameInput.value = "";
    ui.rssUrlInput.value = "";
    await reloadDailyFeed({ silent: true });
    showToast(`已添加 RSS 源：${name}`);
  });

  ui.rssUrlInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      ui.rssAddBtn.click();
    }
  });

  ui.rssReloadBtn.addEventListener("click", async () => {
    await reloadDailyFeed({ silent: false });
  });

  ui.rssResetBtn.addEventListener("click", async () => {
    state.appSettings.rssSources = cloneDefaultRssSources();
    state.rssDiagnostics = new Map();
    saveAppSettings();
    renderRssSourceList();
    renderRssColorLegend();
    await reloadDailyFeed({ silent: true });
    showToast("已恢复默认 RSS 源");
  });

  ui.hintDismiss.addEventListener("click", dismissHint);
  ui.highContrastToggle.addEventListener("change", (e) => {
    state.darkModeHighContrast = !!e.target.checked;
  });

  document.addEventListener("keydown", (e) => {
    const tag = e.target?.tagName || "";
    const typing = tag === "INPUT" || tag === "TEXTAREA";
    if (typing && e.key !== "Escape") return;
    if (state.transition.active && e.key !== "Escape") return;

    if (isContentModalOpen() && !typing) {
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        adjustContentModalScale("in");
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        adjustContentModalScale("out");
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        adjustContentModalScale("reset");
        return;
      }
    }

    if (e.key === "/") {
      e.preventDefault();
      openOverview();
      ui.searchInput.focus();
      return;
    }

    if (e.key.toLowerCase() === "g") {
      toggleOverview();
      return;
    }

    if (e.key.toLowerCase() === "s") {
      toggleSettings();
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      adjustSpeedByKeyboard("faster");
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      adjustSpeedByKeyboard("slower");
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      adjustZoomByKeyboard("in");
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      adjustZoomByKeyboard("out");
      return;
    }

    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      const focus = screenToCell(state.width / 2, state.height / 2);
      state.focusCellX = focus.x;
      state.focusCellY = focus.y;
      setZoom(state.zoom * ZOOM_STEP_FACTOR);
      maybeAutoLayerTransition(true, state.width / 2, state.height / 2);
      return;
    }

    if (e.key === "-") {
      e.preventDefault();
      const focus = screenToCell(state.width / 2, state.height / 2);
      state.focusCellX = focus.x;
      state.focusCellY = focus.y;
      const rawZoom = state.zoom / ZOOM_STEP_FACTOR;
      if (canEnterParentLayer() && rawZoom < state.minZoom * PARENT_ENTRY_ZOOM) {
        startLayerTransition("parent", state.width / 2, state.height / 2);
      } else {
        setZoom(rawZoom);
        maybeAutoLayerTransition(false, state.width / 2, state.height / 2);
      }
      return;
    }

    if (e.key === "]") {
      e.preventDefault();
      startLayerTransition("child", state.width / 2, state.height / 2);
      return;
    }

    if (e.key === "[") {
      e.preventDefault();
      startLayerTransition("parent", state.width / 2, state.height / 2);
      return;
    }

    if (e.key === "0") {
      e.preventDefault();
      resetView(false);
      return;
    }

    if (e.key === "Escape") {
      if (isContentModalOpen()) {
        closeContentModal();
        return;
      }
      closeAllPanels();
      ui.legendPanel.classList.remove("open");
      dismissHint();
    }
  });

  state.canvas.addEventListener("click", onCanvasClick);
  state.canvas.addEventListener("dblclick", onCanvasDoubleClick);
  state.canvas.addEventListener("wheel", onCanvasWheel, { passive: false });
  state.canvas.addEventListener("pointerdown", onCanvasPointerDown);
  state.canvas.addEventListener("pointermove", onCanvasPointerMove);
  state.canvas.addEventListener("pointerup", onCanvasPointerEnd);
  state.canvas.addEventListener("pointercancel", onCanvasPointerEnd);

  document.addEventListener("visibilitychange", () => {
    state.running = !document.hidden;
    if (!document.hidden) {
      state.generationStartTs = performance.now() - state.progress * state.generationMs;
      revealCardsAndSchedule();
    }
  });

  document.addEventListener("fullscreenchange", () => {
    updateFullscreenUi();
  });

  window.addEventListener("resize", () => {
    resizeCanvas();
  });
}

async function init() {
  state.canvas = document.getElementById("lifeCanvas");
  state.ctx = state.canvas.getContext("2d", { alpha: false });
  state.canvas.style.cursor = "grab";
  state.appSettings = loadAppSettings();
  state.savedPool = loadSavedPool();
  syncSettingsFormFromState();
  syncContentModalSaveButton();
  setContentModalScale(1, { silent: true });
  setOverviewMode(state.overviewMode);
  syncSavedQuickAddVisibility();
  renderRssSourceList();
  updateFullscreenUi();
  bindAutoHideCards();

  renderLegendPanel();
  bindUI();
  toggleHintIfNeeded();
  syncZoomUi();
  setGenerationMs(DEFAULT_GENERATION_MS);
  scheduleCardsAutoHide();

  try {
    state.modelIndex = await loadModelIndex();
    eventTracker("home_enter", {
      total_models: state.modelIndex.total,
      note: "dynamic model index",
    });
    await reloadDailyFeed({ silent: true });
  } catch (err) {
    showToast("模型索引加载失败，请检查本地服务路径");
    // eslint-disable-next-line no-console
    console.error(err);
    return;
  }

  resizeCanvas();
  requestAnimationFrame(renderFrame);
}

init();
