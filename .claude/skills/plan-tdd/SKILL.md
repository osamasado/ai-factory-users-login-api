---
name: plan-tdd
description: Stage 2 of the feature pipeline. Read a refinement file and write a TDD implementation plan, one step per acceptance criterion, to plan/<feature>-plan.md. Use after refine-feature has produced its findings file.
---

# Plan: turn refinement findings into a TDD plan

Input: the path to a `plan/<feature-slug>-refinement.md` file, and the original feature ask.

Read that file as your primary source of what the codebase looks like. Do not re-run a broad codebase
survey — if you need to double check one specific detail the refinement file references (an exact
function signature, a DTO's fields), read that one file directly, but do not go re-exploring the whole
route/data/test surface again; that work is already done and trusted.

1. From the feature ask + refinement findings, write explicit **acceptance criteria**: concrete,
   testable statements, including edge cases (missing/invalid input, not-found cases, empty-state
   cases) — not just the happy path.
2. Write a **TDD plan** to `plan/<feature-slug>-plan.md` with one step per acceptance criterion, each
   step containing:
   - The acceptance criterion it covers.
   - The exact test to write first (what file, what it asserts, what the expected failure looks like
     before implementation exists).
   - The minimal implementation change to make it pass (which file(s), what changes — described, not
     written out as code).
3. Order steps so each is independently completable in one red/green cycle, and later steps can build
   on earlier ones.
4. Do not write any test or implementation code yourself in this phase. The plan file is the deliverable.
