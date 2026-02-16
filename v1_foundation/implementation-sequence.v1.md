# Implementation Sequence V1

## Phase A - IA and data contracts (Week 1)

- Finalize scene/mechanism taxonomy (`taxonomy.v1.json`)
- Publish bootstrap snapshot dataset (`explore_units.v1.csv` and `.json`)
- Bootstrap module library (`bootstrap-model-library.v1.ps1`)
- Build runtime index (`build-model-index.v1.ps1`)

## Phase B - Homepage shell (Week 2)

- Build canvas shell with max 4 controls
- Add overview drawer and keyboard entry points
- Add first-visit guidance overlay behavior
- Load homepage units from `model-index.v1.json`

## Phase C - State and hit-testing (Week 3)

- Implement daily seed policy and session restore
- Implement overlap ownership by nearest centroid
- Implement dead-cell feedback path
- Enforce scene diversity in random selection

## Phase D - Metrics and release guardrails (Week 4)

- Integrate analytics batch endpoint usage
- Validate acceptance checklist (`test-acceptance.v1.md`)
- Run staging verification before production rollout

## Done criteria

- Public contracts stable (`api-contract.v1.yaml`, `public-types.v1.ts`)
- Homepage behavior matches `homepage-ux-spec.v1.md`
- Model library can expand without editing static unit-count constants
- Deployment checks documented and executable
