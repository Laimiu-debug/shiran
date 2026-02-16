# IA Architecture V1

## 1. User-facing information architecture

### Top-level navigation (5 items)

1. `/` Home: Conway-based live navigation canvas
2. `/scenes` Scene index: problem-driven exploration
3. `/mechanisms` Mechanism index: cross-domain reasoning
4. `/journeys` Guided paths: curated exploration sequences
5. `/about` Method, data source, project principles

### Three-level structure

1. Scene (problem first)
2. Mechanism (cross-domain explanatory lens)
3. Explore Unit (single interactive artifact)

### Scene definitions

- `日常决策`
- `社会与群体`
- `市场与系统`
- `自然与物理`
- `数学与计算`
- `文化与思想实验`

### Mechanism definitions

- `反馈`
- `博弈`
- `随机性`
- `网络传播`
- `优化`
- `涌现`
- `非线性`
- `认知偏差`
- `平衡与稳定`
- `编码与信息`
- `时空与尺度`
- `策略与风险`

## 2. Model library architecture (dynamic)

### Directory

```text
model_library/
  units/
    <unit-id>/
      manifest.json
      content.mdx (optional)
      simulation.ts (optional)
```

### Build products

- `v1_foundation/model-index.v1.json`
- `v1_foundation/model-index.v1.csv`

### Runtime behavior

- Runtime loads model index, not static count constants.
- Adding/removing unit modules changes runtime availability after index rebuild.
- V1 can keep unpublished modules in `draft` state.

## 3. Frontend layering

1. Token Layer
- Design tokens, semantic color, spacing, typography, motion

2. Presentation Layer
- Route pages, layout shells, responsive composition

3. Interaction Layer
- Home canvas simulation, hit-testing, controls, keyboard shortcuts

4. Domain Layer
- Explore unit model, scene/mechanism taxonomy, ranking and filtering

5. Integration Layer
- API adapters, analytics, search integration, cache strategy

## 4. Backend layering

1. Content API
- Unit list/detail/filter/sort

2. Home State API
- Daily seed, world setup, optional snapshot retrieval

3. Analytics API
- Event batch ingestion

4. Admin API (internal)
- Curation, mapping maintenance, publish controls

5. Creator API (V2 reserved)
- Submission/review/publish workflow

## 5. Backward compatibility

- Preserve original 17 categories as `category_legacy`.
- Keep scene/mechanism as additive fields, not replacements.
- Support mixed filtering: `scene + mechanism + category_legacy`.
