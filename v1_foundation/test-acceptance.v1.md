# Test and Acceptance V1

## A. Reachability

1. Any unit is reachable within 2 interactions from home.
2. Overview is always available regardless of simulation state.
3. Search opens by keyboard `/` and returns relevant units.

## B. Hit-testing

1. Click on live cell routes to the correct unit.
2. Overlap cells consistently route by nearest cluster centroid.
3. Click on dead cell returns nearest active cluster hint.

## C. State consistency

1. Same date produces same seed baseline across devices.
2. Session snapshot restores after refresh.
3. Hidden tab throttles or pauses simulation loop.

## D. Performance

1. Home controls remain responsive under normal load.
2. Simulation step remains stable after prolonged run.
3. Mobile rendering remains usable with active bottom sheet.

## E. Analytics integrity

1. All required event names are emitted.
2. Event payload schema validation passes.
3. Metrics can compute:
   - Home -> Unit CTR
   - 60-second retention
   - Overview usage
   - Exploration coverage distribution

## F. Accessibility

1. Focus order is deterministic.
2. Keyboard navigation covers controls and overview.
3. High-contrast mode preserves scene distinguishability.

## G. Model library contract

1. `model_library/units/**/manifest.json` can all be parsed.
2. `v1_foundation/model-index.v1.json` total equals manifest count.
3. No duplicate `id` and no duplicate `slug`.
4. Each model has non-empty `scene` and 1..3 mechanisms.
5. Runtime behavior does not assume a fixed model count.
