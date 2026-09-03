---
name: refine-feature
description: Stage 1 of the feature pipeline. Survey the codebase (routes, data layer, tests) relevant to a proposed feature using parallel sub-agents, and write findings to plan/<feature>-refinement.md. Use before planning any new endpoint or feature.
---

# Refine: survey before planning

Input: a one-paragraph feature description.

Do not design the feature and do not write any implementation or test code in this phase. Your only
job is to gather facts that the next stage (planning) will need.

1. Launch parallel sub-agents (read-only) to survey, independently:
   - **Route structure**: which controller(s) this feature touches or resembles, existing patterns for
     path params, guards (`@UseGuards`), DTOs, and response shapes.
   - **Data layer**: where the relevant state actually lives today (e.g. an in-memory array in a
     `*.service.ts`, vs. the Prisma schema/client) — note explicitly if the Prisma schema has no models
     yet, so the next stage doesn't assume a database exists.
   - **Test setup**: how existing unit tests (`*.spec.ts` next to source, Jest, `rootDir: src`) and e2e
     tests (`test/*.e2e-spec.ts`, `jest-e2e.json`, supertest) are structured — one representative example
     of each is enough.
2. Consolidate the sub-agents' findings yourself into a single file at `plan/<feature-slug>-refinement.md`
   with sections: **Feature**, **Relevant routes** (file:symbol), **Relevant data layer** (file:symbol,
   what's authoritative today), **Test setup** (how to run tests, where new tests would go, one example
   file to imitate), **Open questions / risks** (anything ambiguous the plan stage must resolve).
3. Do not print the findings as your final answer — the file is the deliverable. Report only a short
   confirmation that the file was written.
