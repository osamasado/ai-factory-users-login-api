---
name: implement-tdd
description: Stage 3 of the feature pipeline. Read a TDD plan file and implement it strictly step by step, red then green, from the plan alone. Use after plan-tdd has produced its plan file.
---

# Implement: execute the TDD plan, nothing else

Input: the path to a `plan/<feature-slug>-plan.md` file.

Read that file as your only source of what to build. Do not re-derive acceptance criteria or re-survey
the codebase from scratch — trust the plan. If you must open a source file to see exact current code
before editing it, that's expected; but the *decisions* (what to build, in what order, what each test
asserts) come from the plan, not from redoing that analysis yourself.

For each step in the plan, in order:
1. **Red**: write the test the step specifies. Run it (`npm test` for unit, `npm run test:e2e` if the
   step is e2e). Confirm it fails for the expected reason (assertion failure, not a compile error).
2. **Green**: make the minimal implementation change the step describes. Re-run the same test, confirm
   it passes, then run the full suite to confirm no regressions.
3. Move to the next step. Do not skip the red step even if you're confident the code would work.

When all steps are done, run the full unit and e2e suites once more and report: which steps passed,
final test output, and anything in the plan that turned out to be wrong or underspecified once you hit
real code (don't silently improvise past it — call it out).
