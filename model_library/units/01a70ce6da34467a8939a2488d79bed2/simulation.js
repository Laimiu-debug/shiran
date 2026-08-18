import { createUnitModule } from "../../runtime/create-unit-module.js";

export function createModule(ctx) {
  return createUnitModule(ctx);
}

export function initSimulation() {
  return { status: "ready" };
}
