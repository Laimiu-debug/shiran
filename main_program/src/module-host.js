import { createUnitModule } from "../../model_library/runtime/create-unit-module.js";
import { createSeededRng, eventTracker, hashString, SCENE_COLORS } from "./utils.js";

let active = null;

function resolveSimulationUrl(unit) {
  const id = String(unit?.id || "").trim();
  if (!id) return "";
  const explicit = String(unit?.entry?.simulation || "").replace(/\\/g, "/");
  if (explicit.startsWith("../") || explicit.startsWith("./") || explicit.startsWith("/")) {
    if (explicit.endsWith(".ts")) {
      return `../model_library/units/${id}/simulation.js`;
    }
    if (explicit.includes("model_library")) {
      return explicit.startsWith("model_library") ? `../${explicit}` : explicit;
    }
  }
  return `../model_library/units/${id}/simulation.js`;
}

function themeFromUnit(unit) {
  return {
    colorSurface: "#07111d",
    colorText: "#d6ebff",
    colorAccent: SCENE_COLORS[unit?.scene] || "#4f7cff",
    radiusSm: "6px",
    radiusMd: "10px",
    radiusLg: "16px",
    motionFastMs: 120,
    motionSlowMs: 420,
  };
}

export function disposeUnitSimulation() {
  if (!active) return;
  try {
    active.instance.dispose?.();
  } catch (_err) {
    // ignore dispose errors from a replaced module
  }
  if (active.canvas && active.canvas.parentElement) {
    active.canvas.remove();
  }
  active = null;
}

export async function mountUnitSimulation(container, unit, options = {}) {
  disposeUnitSimulation();
  if (!container || !unit) return null;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", `${unit.title || "explore unit"} simulation`);
  container.innerHTML = "";
  container.appendChild(canvas);

  const lang = options.lang || document.documentElement.lang || "zh";
  const ctx = {
    unit,
    canvas,
    lang,
    rng: (seedHint) => createSeededRng(hashString(`${unit.id}|${seedHint || "sim"}`)),
    emit: (eventName, payload = {}) => {
      eventTracker(eventName, { unit_id: unit.id, ...payload });
    },
    theme: themeFromUnit(unit),
    clock: {
      now: () => performance.now(),
      isPaused: () => false,
    },
  };

  let factory = createUnitModule;
  const simUrl = resolveSimulationUrl(unit);
  if (simUrl) {
    try {
      const mod = await import(simUrl);
      if (typeof mod.createModule === "function") factory = mod.createModule;
    } catch (_err) {
      factory = createUnitModule;
    }
  }

  const instance = factory(ctx);
  instance.mount();
  active = { instance, canvas, unitId: unit.id };
  return instance;
}
