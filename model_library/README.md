# Shiran Model Library

This directory is the runtime source of truth for explore-unit modules.

## Structure

```text
model_library/
  units/
    <unit-id>/
      manifest.json
      simulation.ts
      content.mdx (optional)
```

## Rules

1. Each unit must provide `manifest.json` following:
   - `v1_foundation/model-manifest.schema.v1.json`
2. Runtime should not assume a fixed number of units.
3. Index is rebuilt by:
   - `v1_foundation/build-model-index.v1.ps1`

## Bootstrap

To initialize modules from current snapshot data:

```powershell
cd v1_foundation
.\bootstrap-model-library.v1.ps1 -Root 'e:\Laimiu\SHIRAN'
.\build-model-index.v1.ps1 -Root 'e:\Laimiu\SHIRAN'
```
