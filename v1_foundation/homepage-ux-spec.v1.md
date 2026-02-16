# Homepage UX Spec V1

## 1. Core principle

- Keep Conway rules pure.
- Keep navigation always reachable.
- Keep behavior reproducible.
- Keep model loading dynamic from model library index.

## 2. Data source contract

- Homepage does not hard-code unit count.
- Homepage reads `model-index.v1.json` (or `/api/v1/model-index`).
- Default filter in production: `status=published`.

## 3. Canvas and controls

### Desktop

- Full-screen simulation canvas.
- Max 4 visible controls:
  - Pause/Resume
  - Speed
  - Legend
  - Overview

### Mobile

- Canvas on top.
- Bottom sheet for overview list and quick picks.
- Default sheet content: 3 currently active units.

## 4. Reachability rules

- Any unit must be reachable within 2 interactions.
- `Overview` remains visible regardless of canvas state.
- Search shortcut:
  - `/` open search
  - `G` open overview

## 5. Hit-testing and ownership

- Click live cell -> route to owned unit.
- Overlap conflict -> choose nearest cluster centroid.
- Dead cell click -> show nearest active cluster suggestion.

## 6. Selection policy (dynamic library)

1. Load all eligible units from model index.
2. Apply daily seed (UTC+8) for reproducible random ordering.
3. Enforce scene diversity quota to avoid over-concentration.
4. Place clusters by manifest `cluster_profile.seed_pattern`:
   - `stable`
   - `oscillator`
   - `random`

## 7. State model

- Daily seed rotates at UTC+8 00:00.
- Session keeps continuous evolution.
- Snapshot restored from local storage on refresh.
- Background tab -> auto throttle/pause.

## 8. Visual encoding

- Scene color first, mechanism texture second.
- Limit simultaneous dominant scene colors.
- Provide high-contrast mode for color-blind accessibility.

## 9. First-visit guidance

- Show a one-time onboarding overlay (8 seconds max).
- Dismiss state persisted in local storage.

## 10. V1 telemetry

- `home_enter`
- `canvas_pause_toggle`
- `canvas_speed_change`
- `cell_click`
- `open_overview`
- `search_submit`
- `jump_to_unit`

## 11. Success metrics

- Home -> Unit CTR
- 60-second first-session retention
- Overview usage rate
- Exploration coverage distribution
