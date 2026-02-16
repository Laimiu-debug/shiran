export interface ModuleTheme {
  colorSurface: string;
  colorText: string;
  colorAccent: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  motionFastMs: number;
  motionSlowMs: number;
}

export interface ModuleClock {
  now(): number;
  isPaused(): boolean;
}

export interface ModuleContext {
  unit: {
    id: string;
    slug: string;
    title: string;
    scene: string;
    mechanisms: string[];
    level: "S级" | "A级" | "B级";
  };
  canvas: HTMLCanvasElement;
  rng: (seedHint?: string) => () => number;
  emit: (eventName: string, payload?: Record<string, unknown>) => void;
  theme: ModuleTheme;
  clock: ModuleClock;
}

export interface ModuleInstance {
  mount(): void;
  tick(dtMs: number): void;
  pause?(): void;
  resume?(): void;
  dispose?(): void;
  serializeState?(): unknown;
  hydrateState?(state: unknown): void;
}

export type CreateModule = (ctx: ModuleContext) => ModuleInstance;
