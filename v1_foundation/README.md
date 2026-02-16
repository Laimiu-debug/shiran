# V1 Foundation Pack

This folder implements the "Homepage Optimization + Site Hierarchy V1" plan as executable artifacts.

## Files

- `taxonomy.v1.json`
  - Scene/mechanism taxonomy and legacy category mapping.
- `explore_units.v1.csv`
  - Bootstrap snapshot dataset (current snapshot is 200 units, not hard-coded).
- `explore_units.v1.json`
  - JSON form of bootstrap snapshot dataset.
- `model-manifest.schema.v1.json`
  - JSON schema for each model module manifest.
- `model-library-spec.v1.md`
  - Dynamic model library structure and runtime loading policy.
- `bootstrap-model-library.v1.ps1`
  - Bootstraps `model_library/units/*` from `explore_units.v1.json`.
- `build-model-index.v1.ps1`
  - Scans module manifests and builds dynamic model index.
- `new-module.v1.ps1`
  - Creates a new module scaffold (`manifest + content + simulation`).
- `model-index.v1.json`
  - Runtime model index built from manifests (total depends on current library).
- `model-index.v1.csv`
  - CSV form of runtime model index.
- `module-extension-api.v1.md`
  - Module integration contract for extension developers.
- `module-runtime-api.v1.ts`
  - Type definitions for host-module runtime API.
- `creator-upload-api.v2-draft.yaml`
  - V2 draft API for external creator uploads/review.
- `ia-architecture.v1.md`
  - User IA and technical layering spec.
- `homepage-ux-spec.v1.md`
  - Homepage behavior and interaction rules.
- `api-contract.v1.yaml`
  - V1 OpenAPI contract (with V2 creator placeholders).
- `public-types.v1.ts`
  - Shared public interfaces.
- `test-acceptance.v1.md`
  - Test matrix and acceptance checks.
- `deployment-tencent.v1.md`
  - Tencent Cloud deployment blueprint.
- `implementation-sequence.v1.md`
  - Phase-by-phase delivery sequence.
- `generate-mapping.v1.ps1`
  - Legacy-to-v1 mapping generator from `ExportBlock` CSV.

## Notes

- V1 keeps creator submission APIs reserved and non-public.
- Legacy categories are retained as `category_legacy` for backward compatibility.
- Frontend default organization is scene-driven; mechanism and legacy category are filters.
- Runtime does not rely on a fixed count. It loads all modules from `model_library/units`.

## Dynamic workflow

1. Add or update a module manifest at `model_library/units/<unit-id>/manifest.json`.
2. Run `v1_foundation/build-model-index.v1.ps1`.
3. Homepage and `/api/v1/units` read from `model-index.v1.json`.
