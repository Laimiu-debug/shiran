# Dynamic Model Library Spec V1

## Why

Model count must not be hard-coded.
The runtime should load whatever models exist in the library.

## Directory contract

```text
model_library/
  units/
    <unit-id>/
      manifest.json
      content.mdx (optional in V1 bootstrap)
      simulation.ts (optional in V1 bootstrap)
```

## Runtime contract

1. Scan `model_library/units/**/manifest.json`.
2. Validate against `model-manifest.schema.v1.json`.
3. Build `model-index.v1.json`.
4. Homepage loader reads model index, not raw folders.

## Selection policy for homepage

- Filter by `status=published` by default.
- Apply daily seed (UTC+8) for reproducible random ordering.
- Keep scene diversity guardrail:
  - each scene has a minimum exposure quota.
- Use `cluster_profile.seed_pattern` for Conway seed placement:
  - `S级 -> stable`
  - `A级 -> oscillator`
  - `B级 -> random`

## Extensibility

Adding a new module requires only:

1. add a new `units/<id>/manifest.json`
2. add content/simulation files
3. run index builder script

No central "200-item" list needs manual editing.
