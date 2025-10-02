# Refactoring Guidelines

This document defines the rules, constraints, and patterns for refactoring the codebase safely and consistently.

## Goals

- Preserve behavior and public APIs while improving structure.
- Keep diffs small, reviewable, and reversible.
- Make modules easier to navigate, test, and evolve.

## Hard constraints

- File size: ≤ 400 lines per file (hard cap).
- Naming:
  - Components: PascalCase files under `src/components/` only (e.g., `PageSummary.ts`).
  - All other files/folders: kebab-case or single lowercase word (e.g., `view-prompts.ts`, `core.ts`).
- Minimal changes: Prefer move/cut and re-exports over rewrites.
- Public surface stability: Do not rename existing import paths or exported identifiers in a single PR.
- No new TypeScript errors: New/edited files should compile under current `tsconfig` rules; don't add `// @ts-ignore`.
- No new global side-effects: Keep top-level side-effects isolated; prefer functions/modules.

## Module patterns

- Compatibility wrapper (keep imports stable):
  - Replace a large legacy file with a tiny wrapper that re-exports from a new module tree.
  - Example: `src/prompt.ts` → `export { prompts, chartPrompts, viewPromptCreators } from '@/prompts'`.
- Barrel files:
  - Each module directory exposes a single barrel (e.g., `index.ts`) or a public API file (e.g., `api.ts`).
  - Internal files must not leak outside unless explicitly re-exported by the barrel.
- Types-first split:
  - Start by extracting `types.ts` (domain interfaces), `shared`/`constants`, then `helpers`, then `core` logic, then `api` re-exports.
- Domain assembly:
  - For large registries/maps, assemble via small domain files (e.g., `views/*.ts`) and aggregate in a tiny file (`view-prompts.ts` or barrel).
- Freezing public maps:
  - Prefer `Object.freeze` for exported constant maps to make intent explicit.

## Safe sequence for refactors

1. Inventory usage.
   - Grep for import path and symbol usage before moving.
2. Create new module directory under `src/<area>/` with kebab-case.
   - Add `types.ts`, `shared.ts|constants.ts`, `helpers.ts`, `core.ts`, `api.ts` as needed.
3. Add a compatibility wrapper at the original import path that re-exports from the new module.
   - Keep all exported names identical.
4. Move logic incrementally into the new files, in small commits.
5. Keep each new file under 400 LOC. If a file approaches 350+, split further.
6. After each step: quick typecheck and a minimal smoke run.
7. Only after consumers are all using the barrel, consider deleting temporary intermediates.

## Allowed vs not allowed

- Allowed:
  - Splitting files, moving code, adding wrappers/barrels, extracting pure helpers/constants/types.
  - Renaming internal-only file names (kebab-case) and private symbols.
- Not allowed (in a refactor-only PR):
  - Changing behavior or response shapes.
  - Renaming public exports or changing import paths (without a compatibility layer).
  - Mixing feature changes with structural moves.

## Structure examples

- Prompts (done):
  - `src/prompt.ts` → tiny wrapper.
  - `src/prompts/` → `index.ts` (barrel), `chart-prompts.ts`, `views/*`, `views/shared.ts`.
- Store (done):
  - `src/store.ts` → tiny wrapper: `export * from './store/api'`.
  - `src/store/` → `types.ts`, `defaults.ts`, `helpers.ts`, `core.ts`, `api.ts`.

## PR checklist

- Public API:
  - [ ] All previous import paths still work (e.g., `@/store`, `@/prompt`).
  - [ ] Exported identifiers remain identical.
- File hygiene:
  - [ ] No file exceeds 400 LOC.
  - [ ] New files follow kebab-case (or single lowercase) naming.
- Types:
  - [ ] No new TS errors in changed files.
  - [ ] `any` accepted only for legacy boundaries; prefer explicit interfaces in new files.
- Behavior:
  - [ ] No functional changes.
  - [ ] Added/updated unit tests if behavior changed (should not in refactor-only).

## Quick checks (optional)

- Count lines for a module:

```bash
wc -l src/store.ts src/store/*.ts | sed 's/^ *//g'
```

- Find oversize files across src:

```bash
find src -type f -name '*.ts' -exec sh -c 'wc -l "$1" | awk "$1 ~ /src\/.*\.ts$/ && $1 > 400"' _ {} \;
```

## When to split

- Any file > 300 LOC should be planned for split.
- Prefer splitting by concerns:
  - Types/interfaces
  - Shared constants/helpers
  - Core logic (pure, testable)
  - Integration/adapters (DOM, network, Chart.js)
  - Public API surface (barrel/api)

## Deprecation policy (for future changes)

- Step 1: Add new API with same behavior; keep old export path re-exporting from the new one.
- Step 2: Migrate internal imports to the new path.
- Step 3: After 2 releases, remove the compatibility export.

## Notes

- Keep path aliases intact (`@/*` in `tsconfig.json`).
- Avoid circular dependencies; if needed, lift shared types/helpers to a higher-level `shared/`.
- Re-run a small smoke test of the app after each move.
