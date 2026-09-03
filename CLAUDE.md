# users-api

NestJS user-management API: register/login (JWT), user CRUD, role-guarded admin route, login history.
Everything is in-memory (`UsersService`) — Prisma is scaffolded but not wired up. Tests: `npm test`
(Jest, unit) and `npm run test:e2e` (supertest, e2e).

## Feature pipeline — mandatory

Every new feature request in this project goes through three stages, each a **separate, fresh
Claude Code session** with no shared context with the others — not three steps in one conversation.
Each stage hands off to the next only through a file on disk; nothing is passed by pasting context
into the next prompt.

1. **Refine** — follow `.claude/skills/refine-feature/SKILL.md`. Survey the codebase (via parallel
   sub-agents) for what the feature touches, write findings to `plan/<feature>-refinement.md`.
2. **Plan** — a fresh session, given only `plan/<feature>-refinement.md`. Follow
   `.claude/skills/plan-tdd/SKILL.md`. Writes acceptance criteria and a TDD plan (one step per
   criterion) to `plan/<feature>-plan.md`.
3. **Implement** — a fresh session, given only `plan/<feature>-plan.md`. Follow
   `.claude/skills/implement-tdd/SKILL.md`. Executes the plan step by step, red then green.

After stage 3, independently re-run `npm test` and `npm run test:e2e` yourself and report the actual
numbers — do not take the implementing session's word for it. This is the real verification step;
none of the three stages above are enforced by a hook, so a stage doing its job well is still not
guaranteed, only checked afterward.

Skip this pipeline only if the user explicitly asks for a quick/direct change instead.
