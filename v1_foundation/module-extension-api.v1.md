# Module Extension API V1

This document defines what a module must provide to integrate with the Shiran host runtime.

## 1. Module package structure

```text
model_library/units/<unit-id>/
  manifest.json
  simulation.ts
  content.mdx (optional in V1)
```

## 2. Required manifest contract

See schema:

- `model-manifest.schema.v1.json`

Critical fields:

- `id`
- `slug`
- `title`
- `scene`
- `mechanisms` (1..3)
- `level`
- `status`
- `entry.content`
- `entry.simulation`

## 3. Simulation runtime API (host -> module)

A module simulation should export:

```ts
export function createModule(ctx: ModuleContext): ModuleInstance;
```

### ModuleContext

- `unit`: current manifest data
- `canvas`: host-provided rendering element
- `rng(seedHint?: string): () => number`
- `emit(eventName: string, payload?: Record<string, unknown>)`
- `theme`: semantic tokens for visual consistency
- `clock`: host timeline controls

### ModuleInstance

- `mount(): void` (required)
- `tick(dtMs: number): void` (required)
- `pause?(): void`
- `resume?(): void`
- `dispose?(): void`
- `serializeState?(): unknown`
- `hydrateState?(state: unknown): void`

## 4. Event API (module -> host)

Recommended event names:

- `module_enter`
- `module_param_change`
- `module_reset`
- `module_complete`
- `module_share`

Host normalizes these events into `/api/v1/events/batch`.

## 5. Compatibility policy

- Module must avoid global DOM mutations outside host mount root.
- Module must not assume viewport size.
- Module should run at 30 FPS minimum on mid-tier mobile target.
- Module should degrade gracefully if WebGL is unavailable.

## 6. Validation pipeline

Before publishing:

1. Manifest schema validation
2. Duplicate `id/slug` checks
3. Build model index
4. Smoke-load simulation module
5. Accessibility and performance spot checks

## 7. Publish workflow (V1)

- `draft` -> `review` -> `published`
- Only `published` modules are eligible for production homepage selection.
