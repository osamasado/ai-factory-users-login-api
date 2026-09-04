# Feature

Add `GET /users/me` that returns the profile of the currently logged-in user (resolved from the JWT
on the request), excluding the `password` field.

# Relevant routes

- `src/users/users.controller.ts` — `@Controller('users')` (line 13). Existing routes:
  - `POST /users` — `createUser` (17-20), no guard
  - `GET /users` — `getAllUsers` (23-26), guard commented out (`// @UseGuards(JwtAuthGuard)`, line 22)
  - `GET /users/:id` — `findOne` (28-31), no guard, returns full `User` including `password`
  - `PUT /users/:id` — `updateUser` (33-36), no guard
  - `DELETE /users/:id` — `deleteUser` (38-41), no guard
  - `GET /users/:id/login-history` — `getLoginHistory` (43-46), no guard
  - `GET /users/admin-only` — `getAdminData` (48-53), guarded: `@UseGuards(JwtAuthGuard, RolesGuard)` +
    `@Roles(Role.ADMIN)` — the only guarded route in the codebase, and it has no test at all.
  - **Routing-order note**: `admin-only` (line 50) is declared *after* `:id` (line 28) in the class, so a
    literal segment declared after a wildcard param could be shadowed by it depending on Nest's route
    registration order. `me` would have the same risk if placed after `:id` — placing `GET /users/me`
    before `@Get(':id')` avoids this.
- `src/auth/auth.controller.ts` — `@Controller('auth')` (line 6): `POST /auth/register` (10-17),
  `POST /auth/login` (19-25).
- Auth guard: `src/auth/auth/auth.guard.ts` — `JwtAuthGuard extends AuthGuard('jwt')`.
- JWT strategy: `src/auth/strategies/jwt/jwt.strategy.ts`. `validate(payload)` (15-21) returns
  `{ userId: payload.id, email: payload.email, role: payload.role }` — note the key is **`userId`**, not
  `id` or `sub`. This becomes `request.user`, so a `/users/me` handler must read `req.user.userId`.
- No `@CurrentUser()` decorator exists anywhere (grep confirmed no matches). No controller currently
  reads `@Req()`/`req.user` directly — the only place `request.user` is read today is inside
  `RolesGuard` (`src/auth/roles/roles.guard.ts:16-19`).
- No response DTO / password-exclusion pattern exists anywhere in the codebase. `class-transformer` is
  a dependency but unused (no `@Exclude()`, no `ClassSerializerInterceptor` registered in `main.ts`).
  Today, `GET /users/:id` leaks the full `User` object including `password` — there is no precedent to
  imitate for stripping a field; this endpoint would establish the first one (even if just via manual
  destructuring, since `ClassSerializerInterceptor` isn't wired up).

# Relevant data layer

- `src/users/users.service.ts` — `UsersService` holds all state in-memory:
  - `private users: User[] = []` (line 9)
  - `private loginHistory = new Map<string, Date[]>()` (line 10)
  - Lookup methods: `findAll()` (25-27, no sanitization), `findByEmail(email)` (29-31, returns
    `User | undefined`), `findOne(id)` (33-39, throws `NotFoundException('User not found')` if missing —
    does **not** return `undefined`), `update`, `remove`, `recordLogin`, `getLoginHistory`.
  - None of these strip `password` before returning.
- `User` interface — `src/users/interfaces/user.interface.ts`:
  ```ts
  export enum Role { USER = 'user', ADMIN = 'admin' }
  export interface User { id: string; name: string; email: string; password: string; role: Role; }
  ```
  `id` is `Date.now().toString()` (service line 14). `password` is stored **hashed** when created via
  `POST /auth/register` (bcrypt in `AuthService.register`, `auth.service.ts:14-16`), but `UsersService.create`
  itself does no hashing — a direct `POST /users` call would store a plaintext password. Not relevant to
  reading `/users/me`, but relevant if the plan stage touches `create`.
- **Prisma is scaffolded but NOT authoritative and NOT wired up.** `prisma/schema.prisma` has only
  `generator`/`datasource` blocks, zero `model` definitions. No `PrismaClient`/`PrismaService` usage
  anywhere in `src/` (confirmed by grep — zero matches). All real data flows through the in-memory
  `UsersService.users` array above. The plan stage should not assume any database exists.
- JWT payload signed at login — `auth.service.ts:30-34`: `{ id: user.id, email: user.email, role: user.role }`.
  So `req.user.userId` (per the strategy's `validate` remap above) equals `user.id`, and can be passed
  directly to `UsersService.findOne(id)`.

# Test setup

- Run unit tests: `npm test` (Jest, `rootDir: src`, `testRegex: .*\.spec\.ts$`, config embedded in
  `package.json`). Run e2e: `npm run test:e2e` (`jest --config ./test/jest-e2e.json`, `rootDir: .`,
  `testRegex: .e2e-spec.ts$`).
- Unit test pattern to imitate: `src/users/users.controller.spec.ts`. Uses
  `Test.createTestingModule({ controllers: [...], providers: [...] }).compile()` with the **real**
  `UsersService` (no mocking anywhere in the codebase) — seed state via `usersService.create(...)`, then
  call controller methods directly (not over HTTP) and assert with plain Jest matchers. A new unit test
  for `/users/me` would go in this same file, likely calling the controller method directly with a
  fabricated `req.user`-shaped object (or whatever param the plan settles on).
- e2e test pattern to imitate: `test/login-history.e2e-spec.ts`. Boots the real `AppModule` fresh in
  `beforeEach`/closes in `afterEach` (in-memory state resets each test since a fresh module is compiled).
  **No existing e2e test sends an `Authorization: Bearer <token>` header** — the only auth-related
  existing test asserts that `/users/:id/login-history` requires *no* Authorization header, since it's
  unguarded. A new e2e test for `/users/me` would be the **first** to exercise the full guarded flow:
  `POST /auth/register` → `POST /auth/login` → extract `res.body.access_token` → `.set('Authorization',
  \`Bearer ${token}\`)` on the `GET /users/me` request. This exact `.set(...)` call doesn't appear
  anywhere yet, but is the standard supertest idiom and matches `JwtStrategy`'s
  `ExtractJwt.fromAuthHeaderAsBearerToken()`.
- The only existing guarded route (`GET /users/admin-only`) has **zero tests** (unit or e2e) — there is
  no existing test to imitate for guard/JWT flow specifically, only for the plain in-memory service
  patterns.
- New file candidates: unit test lives in `src/users/users.controller.spec.ts` (add a `describe('me', ...)`
  block); e2e test likely as a new `test/users-me.e2e-spec.ts` following the `login-history.e2e-spec.ts`
  shape, or added into an existing users e2e spec if one better fits.

# Open questions / risks

- **How to resolve "the logged-in user" in the controller** — there's no `@CurrentUser()` decorator and
  no precedent for reading `req.user` in a controller. The plan stage must decide: use `@Request() req`
  and read `req.user.userId` directly, or introduce a `@CurrentUser()` param decorator. Either is
  consistent with existing code, but nothing in the codebase currently prefers one over the other.
- **How to exclude `password` from the response** — no serialization mechanism exists
  (`ClassSerializerInterceptor` is not registered; `class-transformer` decorators are unused). The plan
  stage must decide between: manual destructuring/omit in the controller or service, or wiring up
  `class-transformer` + `ClassSerializerInterceptor` for the first time. The latter is a larger change
  (global interceptor affects all routes) — worth flagging as a scope decision.
- **Route ordering** — `@Get('me')` must be declared before `@Get(':id')` in `UsersController` to avoid
  being shadowed (see routing-order note above under Relevant routes).
- **`findOne` throws instead of returning undefined** — if the user encoded in a valid JWT was somehow
  deleted since token issue, `UsersService.findOne(id)` throws `NotFoundException`. Existing behavior for
  `GET /users/:id` already relies on this; the plan stage doesn't need to invent new error handling, just
  confirm this is acceptable for `/me` too.
- **No existing DTO for a "safe" user shape** — the plan stage will need to decide whether to introduce
  one (e.g. `UserResponseDto` or an inline `Omit<User, 'password'>`) or handle it ad hoc; there is no
  existing convention to defer to.
