# Login History — TDD Implementation Plan (Stage 2)

Source of truth: `plan/login-history-refinement.md`. This plan resolves the open questions raised
there and breaks the feature into one red/green TDD step per acceptance criterion.

## Architectural decisions (resolving the refinement's open questions)

1. **Store-split resolution (open question #1)** — `AuthService` and `UsersService` currently keep
   independent, disconnected `private users: User[]` arrays. Decision: **unify on `UsersService` as
   the single canonical user store**, by wiring the modules together:
   - `UsersModule` exports `UsersService`.
   - `AuthModule` imports `UsersModule` and injects `UsersService` into `AuthService`.
   - `AuthService` deletes its own `private users: User[]` array. `register()` calls
     `UsersService.create(...)` instead of pushing into its own array. `login()` calls a new
     `UsersService.findByEmail(email)` instead of searching its own array.
   - This is necessary, not optional: without it, a user who registered via `/auth/register` may
     not exist from `UsersService`'s point of view, so `GET /users/:id/login-history` would 404 for
     a real user who just logged in successfully — which would violate the feature's own
     404-vs-empty-array contract.
2. **Persistence (open question #2)** — stay **in-memory**, consistent with the rest of the
   codebase (no Prisma models exist; introducing real persistence is out of scope for this
   feature). Login history is stored as a `Map<string, Date[]>` inside `UsersService`, keyed by the
   same `id` that `findOne`/`findAll` use.
3. **404 vs empty-array semantics (open question #3)** — now solvable cleanly given decision #1:
   `UsersService.getLoginHistory(id)` calls the existing `findOne(id)` (which throws
   `NotFoundException('User not found')` for an unknown id) and, if that succeeds, returns
   `this.loginHistory.get(id) ?? []`. Same convention as every other 404 in the codebase (thrown
   from the service layer, no controller-level try/catch, no global exception filter needed).
4. **Guard/auth requirement (open question #4)** — decision: **no guard** on
   `GET /users/:id/login-history`, matching every other existing `:id`-scoped route
   (`GET/PUT/DELETE /users/:id` all have no active guard today; only the unrelated, role-gated
   `admin-only` static route is guarded). Rationale: the feature ask does not request
   authentication; there is no existing precedent in this codebase for a guarded `:id` route, and
   introducing one here would require inventing new semantics (self-only vs. any-authenticated
   access) that nobody asked for and that would make this route inconsistent with its siblings. This
   is an explicit, reasoned scope decision, not an oversight — flagged here and locked in by an
   explicit test (Step 6) so it reads as "decided", not "forgotten".
5. **Response shape / DTO (open question #6)** — no response DTO. Consistent with `GET /users/:id`
   today (which returns the raw `User`, including `password`, with no serialization), the new
   endpoint returns a plain array (`Date[]`, serialized by Nest/Express as ISO-8601 strings). Fixing
   the pre-existing password-leak on `findOne` is out of scope — not requested by this feature.
6. **Test mocking (open question #7)** — continue the existing "real DI, no mocks" convention.
   `UsersService`'s in-memory store is cheap and fast, so unit tests wire `AuthService` +
   `UsersService` together for real via `Test.createTestingModule` rather than mocking either one.
   This is also a better test of decision #1 (the store-unification) than a mock would be, since
   mocking `UsersService` inside an `AuthService` unit test would hide exactly the wiring bug this
   plan exists to fix.
7. **User id collisions (open question #5)** — acknowledged, not this feature's problem (pre-existing
   `Date.now().toString()` id generation is unchanged by this plan).

## Acceptance criteria

- **AC1.** A user created via `AuthService.register(...)` is visible to `UsersService` (i.e.
  `UsersService.findAll()`/`findOne()` can see it) — the two services share one user store.
- **AC2.** `UsersService` can record a login timestamp for a user id and read back the timestamps
  recorded for that id; looking up history for an id that does not exist throws
  `NotFoundException`; looking up history for an id that exists but has no recorded logins returns
  `[]`.
- **AC3.** On a successful `POST /auth/login`, a login timestamp is recorded for that user.
- **AC4.** On a failed `POST /auth/login` (bad email or bad password), no login timestamp is
  recorded.
- **AC5.** `GET /users/:id/login-history` returns `200` with the user's recorded login timestamps
  (as an array, in the order they occurred) when the user exists, and `[]` when the user exists but
  has never logged in.
- **AC6.** `GET /users/:id/login-history` returns `404` when the user id does not exist, and does
  **not** require authentication (no guard) — reachable with no `Authorization` header.
- **AC7.** End-to-end: registering a user, logging in one or more times, and then calling
  `GET /users/:id/login-history` against the real, fully-wired `AppModule` returns the correct
  timestamps — proving the module wiring from decision #1 is correct in the actual app, not just in
  a hand-assembled test module.

## TDD plan

### Step 1 — AC1: shared user store between `AuthService` and `UsersService`

**Test first** — new file `src/auth/auth.service.spec.ts` (replacing the current empty scaffold),
new `describe('AuthService + UsersService shared store', ...)`:
```ts
const module = await Test.createTestingModule({
  imports: [JwtModule.register({ secret: 'test-secret' })],
  providers: [AuthService, UsersService],
}).compile();
authService = module.get(AuthService);
usersService = module.get(UsersService);
```
`it('a user registered via AuthService.register is visible to UsersService', async () => { await authService.register('Alice', 'alice@example.com', 'password123'); const all = usersService.findAll(); expect(all).toHaveLength(1); expect(all[0].email).toBe('alice@example.com'); })`

Expected failure before implementation: `AuthService`'s constructor doesn't accept/use
`UsersService` yet, and `register()` pushes into its own private array, so `usersService.findAll()`
returns `[]` — `expect(all).toHaveLength(1)` fails (`0 !== 1`).

**Minimal implementation:**
- `src/users/users.module.ts` — add `exports: [UsersService]`.
- `src/auth/auth.module.ts` — add `imports: [UsersModule, ...]` (alongside existing
  `PassportModule`/`JwtModule`).
- `src/users/users.service.ts` — add `findByEmail(email: string) { return this.users.find(u => u.email === email); }`.
- `src/auth/auth.service.ts` — inject `UsersService` in the constructor
  (`constructor(private readonly jwtService: JwtService, private readonly usersService: UsersService) {}`);
  delete `private users: User[] = []`; in `register()`, replace the manual push with
  `return this.usersService.create({ name, email, password: hashed }), then return { message: 'User created' }`
  (or capture the created user's id if useful later — not required by AC1); in `login()`, replace
  `this.users.find(u => u.email === email)` with `this.usersService.findByEmail(email)`.

### Step 2 — AC2: `UsersService` login-history storage + 404/empty-array behavior

**Test first** — `src/users/users.service.spec.ts`, new `describe('login history', ...)` using a
plain `new UsersService()` (no DI needed, it's a self-contained unit):
```ts
it('throws NotFoundException for an unknown user id', () => {
  expect(() => service.getLoginHistory('does-not-exist')).toThrow(NotFoundException);
});
it('returns an empty array for a known user with no recorded logins', () => {
  const user = service.create({ name: 'Bob', email: 'bob@example.com', password: 'password123' });
  expect(service.getLoginHistory(user.id)).toEqual([]);
});
it('returns recorded timestamps after recordLogin is called', () => {
  const user = service.create({ name: 'Cara', email: 'cara@example.com', password: 'password123' });
  service.recordLogin(user.id);
  service.recordLogin(user.id);
  const history = service.getLoginHistory(user.id);
  expect(history).toHaveLength(2);
  expect(history[0]).toBeInstanceOf(Date);
});
```
Expected failure before implementation: `getLoginHistory`/`recordLogin` don't exist on
`UsersService` yet — TypeScript compile error / `TypeError: service.getLoginHistory is not a
function` at runtime, i.e. all three assertions fail immediately, not just produce a wrong value.

**Minimal implementation** — `src/users/users.service.ts`:
- Add `private loginHistory = new Map<string, Date[]>();`
- Add `recordLogin(id: string): void { const entries = this.loginHistory.get(id) ?? []; entries.push(new Date()); this.loginHistory.set(id, entries); }`
- Add `getLoginHistory(id: string): Date[] { this.findOne(id); return this.loginHistory.get(id) ?? []; }`
  (reuses the existing `findOne` 404 guard — no duplicated not-found logic).

### Step 3 — AC3: successful login records a timestamp

**Test first** — `src/auth/auth.service.spec.ts`, extend the shared-store `describe` block:
```ts
it('records a login timestamp on successful login', async () => {
  await authService.register('Dana', 'dana@example.com', 'password123');
  const user = usersService.findAll()[0];
  await authService.login('dana@example.com', 'password123');
  expect(usersService.getLoginHistory(user.id)).toHaveLength(1);
});
```
Expected failure before implementation: `AuthService.login` never calls `recordLogin`, so
`getLoginHistory(user.id)` returns `[]` — `expect(...).toHaveLength(1)` fails (`0 !== 1`).

**Minimal implementation** — `src/auth/auth.service.ts`: in `login()`, after the JWT is signed
(success path only, after both the "user not found" and "bad password" checks have passed), add
`this.usersService.recordLogin(user.id);` before `return { access_token: token };`.

### Step 4 — AC4: failed login does not record a timestamp

**Test first** — same `describe` block in `src/auth/auth.service.spec.ts`:
```ts
it('does not record a login timestamp on failed login', async () => {
  await authService.register('Eve', 'eve@example.com', 'password123');
  const user = usersService.findAll()[0];
  await expect(authService.login('eve@example.com', 'wrong-password')).rejects.toThrow(UnauthorizedException);
  expect(usersService.getLoginHistory(user.id)).toEqual([]);
});
```
Expected result: given Step 3's implementation places the `recordLogin` call after both
credential checks, this test is expected to **pass immediately** with no further code change — the
failed-password branch throws and returns before `recordLogin` is ever reached. This step exists to
lock AC4 in as an explicit, permanent regression test (so a future refactor that moves
`recordLogin` earlier in `login()` breaks a test, rather than silently starting to log failed
attempts). No implementation change expected for this step.

### Step 5 — AC5: `GET /users/:id/login-history` endpoint (happy path + empty array)

**Test first** — `src/users/users.controller.spec.ts`, replacing the current empty scaffold with a
real `Test.createTestingModule({ controllers: [UsersController], providers: [UsersService] })`:
```ts
it('returns [] for a user with no login history', () => {
  const user = usersService.create({ name: 'Fay', email: 'fay@example.com', password: 'password123' });
  expect(controller.getLoginHistory(user.id)).toEqual([]);
});
it('returns recorded timestamps for a user who has logged in', () => {
  const user = usersService.create({ name: 'Gus', email: 'gus@example.com', password: 'password123' });
  usersService.recordLogin(user.id);
  expect(controller.getLoginHistory(user.id)).toHaveLength(1);
});
```
Expected failure before implementation: `UsersController` has no `getLoginHistory` method yet —
TypeScript compile error / `controller.getLoginHistory is not a function`.

**Minimal implementation** — `src/users/users.controller.ts`: add
```ts
@Get(':id/login-history')
getLoginHistory(@Param('id') id: string) {
  return this.usersService.getLoginHistory(id);
}
```
(Route ordering relative to `@Get(':id')` doesn't matter — `:id/login-history` is a two-segment
path and can't be matched by the single-segment `:id` route, so there's no collision to worry
about, unlike the pre-existing `admin-only`-vs-`:id` ordering issue noted in the refinement.)

### Step 6 — AC6: 404 for unknown id, and no auth guard required

**Test first** — new file `test/login-history.e2e-spec.ts`, following the existing
`test/app.e2e-spec.ts` structure (`beforeEach` builds the real `AppModule` via
`Test.createTestingModule({ imports: [AppModule] }).compile()`, `afterEach` closes it):
```ts
it('GET /users/:id/login-history returns 404 for an unknown id', () => {
  return request(app.getHttpServer())
    .get('/users/does-not-exist/login-history')
    .expect(404);
});

it('GET /users/:id/login-history requires no Authorization header', async () => {
  const registerRes = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name: 'Hana', email: 'hana@example.com', password: 'password123' });
  expect(registerRes.status).toBe(201);
  const user = /* look up via GET /users to get the id, since /auth/register doesn't return one */;
  await request(app.getHttpServer())
    .get(`/users/${user.id}/login-history`)
    .expect(200); // no Authorization header set at all
});
```
(To get `user.id` without a dedicated lookup-by-email endpoint, call `GET /users` right after
registering and find the entry by email — the same approach Step 7's test needs anyway.)

Expected failure before implementation: the route doesn't exist yet at all, so both requests
currently 404 for the *wrong* reason (unmatched route, not a deliberate not-found response) —
after Step 5's implementation, the "unknown id" case genuinely exercises `NotFoundException` from
`getLoginHistory`, and the "no Authorization header" case is expected to already pass immediately
(no guard was ever added), which is exactly what this step is meant to confirm and lock in as a
permanent test of decision #4.

**Minimal implementation:** none beyond Step 5 — this step is a verification/lock-in step for
already-implemented behavior, run through the real HTTP layer (unlike Step 5's controller-level
unit test, this is the only place a guard's absence can actually be observed, since `@UseGuards` is
only invoked in a real request pipeline).

### Step 7 — AC7: full end-to-end regression across the real `AppModule`

**Test first** — extend `test/login-history.e2e-spec.ts`:
```ts
it('records and returns login history end-to-end', async () => {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name: 'Ivan', email: 'ivan@example.com', password: 'password123' })
    .expect(201);
  const usersRes = await request(app.getHttpServer()).get('/users');
  const user = usersRes.body.find(u => u.email === 'ivan@example.com');

  await request(app.getHttpServer())
    .get(`/users/${user.id}/login-history`)
    .expect(200)
    .expect([]);

  await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: 'ivan@example.com', password: 'password123' })
    .expect(201); // Nest's default 2xx for POST is 201 unless @HttpCode overrides it

  const historyRes = await request(app.getHttpServer())
    .get(`/users/${user.id}/login-history`)
    .expect(200);
  expect(historyRes.body).toHaveLength(1);
});
```
Expected failure before Step 1's implementation exists: registering via `/auth/register` would not
make the user visible via `GET /users` at all (`usersRes.body.find(...)` returns `undefined`,
`user.id` throws), so this test would fail long before reaching the login-history assertions. By
the time this step is reached, Steps 1–6 are already implemented, so this test is expected to
**pass immediately** — its purpose is not to drive new code, but to prove the module-level DI
wiring (`UsersModule` exporting `UsersService`, `AuthModule` importing `UsersModule`) is correct in
the real `AppModule`, which none of the earlier unit tests can prove since they hand-assemble
`AuthService` + `UsersService` into the same `TestingModule` directly, sidestepping the module
`imports`/`exports` graph entirely. If this test fails while Steps 1–6's tests all pass, the bug is
specifically in `auth.module.ts` / `users.module.ts` wiring, not in `AuthService`/`UsersService`
logic.

**Minimal implementation:** none expected beyond Steps 1–6; this step exists purely as an
integration safety net.
