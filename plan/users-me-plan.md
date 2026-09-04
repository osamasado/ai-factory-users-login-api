# Feature

`GET /users/me` — returns the profile of the currently logged-in user (resolved from the JWT on the
request), excluding the `password` field.

Source: `plan/users-me-refinement.md`.

# Design decisions (resolving refinement's open questions)

- **Resolving the current user**: use `@Request() req` in the controller and read `req.user.userId`
  (the `JwtStrategy.validate()` payload shape is `{ userId, email, role }` — confirmed in the
  refinement file). No new `@CurrentUser()` decorator — introducing one would be a bigger surface than
  this single route needs.
- **Excluding `password`**: manual destructuring in the controller (`const { password, ...profile } =
  user; return profile;`). Wiring up `ClassSerializerInterceptor` + `class-transformer` globally is a
  much larger, cross-cutting change (affects every route) and is out of scope for a single endpoint —
  not doing that here.
- **Guard**: `@UseGuards(JwtAuthGuard)` only. No role restriction — any authenticated user may view
  their own profile.
- **Route placement**: `@Get('me')` is declared in `UsersController` *before* `@Get(':id')`, to avoid
  being shadowed by the `:id` wildcard (per refinement's routing-order note).
- **Not-found behavior**: reuse `UsersService.findOne(id)`, which already throws `NotFoundException`
  when the id doesn't exist. No new error handling needed.

# Acceptance criteria

1. `GET /users/me` with no `Authorization` header returns `401 Unauthorized`.
2. `GET /users/me` with a malformed/invalid bearer token returns `401 Unauthorized`.
3. `GET /users/me` with a valid JWT for an existing user returns `200 OK` with that user's `id`,
   `name`, `email`, and `role`, and the response body has **no** `password` key.
4. `GET /users/me` with a valid JWT whose encoded user id no longer exists (e.g. the user was deleted
   after the token was issued) returns `404 Not Found`.

# TDD plan

## Step 1 — AC1: no Authorization header → 401

**Test first** — new file `test/users-me.e2e-spec.ts` (model its `beforeEach`/`afterEach` app
bootstrap on `test/login-history.e2e-spec.ts`):

```ts
it('GET /users/me without Authorization header returns 401', async () => {
  await request(app.getHttpServer()).get('/users/me').expect(401);
});
```

Expected failure before implementation: the route doesn't exist yet, so Nest returns `404 Not Found`,
not `401` — test fails on status code mismatch.

**Minimal implementation** — in `src/users/users.controller.ts`:
- Add `@UseGuards(JwtAuthGuard) @Get('me') getMe() { return null; }` (stub body), positioned **before**
  the existing `@Get(':id')` handler in the class.
- Import `JwtAuthGuard` from `../auth/auth/auth.guard` (already imported for `admin-only`, just reuse
  the existing import in this file).

This alone makes the test pass: `JwtAuthGuard` rejects the unauthenticated request with `401` before
the stub body ever runs.

## Step 2 — AC2: invalid/malformed bearer token → 401

**Test first** — add to `test/users-me.e2e-spec.ts`:

```ts
it('GET /users/me with an invalid token returns 401', async () => {
  await request(app.getHttpServer())
    .get('/users/me')
    .set('Authorization', 'Bearer not-a-real-token')
    .expect(401);
});
```

Expected state: this will likely already pass immediately after Step 1, since `passport-jwt` rejects
an unverifiable token before the handler runs. That's fine — write the test anyway to lock in the
contract; it is not required to be red first if the prior step's guard already covers it. If it
unexpectedly fails, treat that as a real bug in guard wiring, not something to special-case around.

**Implementation**: none expected beyond Step 1.

## Step 3 — AC3: valid JWT, existing user → 200 with profile, no password

**Test first** — add to `test/users-me.e2e-spec.ts`:

```ts
it('GET /users/me returns the logged-in user profile without the password field', async () => {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name: 'Mona', email: 'mona@example.com', password: 'password123' })
    .expect(201);

  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: 'mona@example.com', password: 'password123' })
    .expect(201);

  const token = loginRes.body.access_token;

  const res = await request(app.getHttpServer())
    .get('/users/me')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  expect(res.body.email).toBe('mona@example.com');
  expect(res.body.name).toBe('Mona');
  expect(res.body).toHaveProperty('role');
  expect(res.body).toHaveProperty('id');
  expect(res.body.password).toBeUndefined();
  expect(Object.keys(res.body)).not.toContain('password');
});
```

Check the exact response body key for the login token first (grep `access_token` in
`auth.service.ts`/`auth.controller.ts` if the refinement file didn't confirm the literal key name) so
the test reads the right field.

Expected failure before implementation: `getMe()` stub still returns `null`, so `res.body` is `{}` (or
the request fails to match `200`/the assertions on `email`/`name` fail against `null`).

**Minimal implementation** — in `src/users/users.controller.ts`, replace the stub:

```ts
@UseGuards(JwtAuthGuard)
@Get('me')
getMe(@Request() req) {
  const user = this.usersService.findOne(req.user.userId);
  const { password, ...profile } = user;
  return profile;
}
```

- Import `Request` from `@nestjs/common` (alongside the other decorators already imported in this
  file).
- No changes needed to `UsersService` — `findOne` already exists and returns the full `User`.

## Step 4 — AC4: valid JWT, user no longer exists → 404

**Test first** — add a unit test to `src/users/users.controller.spec.ts` (model its existing
`TestingModule` setup with the real `UsersService`, per the refinement file's documented pattern):

```ts
describe('getMe', () => {
  it('throws NotFoundException when the JWT user id does not exist', () => {
    expect(() =>
      controller.getMe({ user: { userId: 'nonexistent-id' } } as any),
    ).toThrow(NotFoundException);
  });
});
```

Expected state: this will likely already pass immediately after Step 3, since `UsersService.findOne`
already throws `NotFoundException` when the id isn't found, and `getMe` doesn't catch it. Write the
test anyway to lock in the contract at the controller level. If it fails, that means `findOne`'s
throwing behavior isn't propagating from `getMe` as expected — investigate and fix `getMe`, not the
test.

**Implementation**: none expected beyond Step 3.

# Notes for the implementing session

- Run `npm test` after each unit-test step and `npm run test:e2e` after each e2e-test step; don't batch
  verification to the end.
- Steps 2 and 4 are expected to already be green when written — that's a legitimate outcome of steps 1
  and 3's implementation, not a sign the plan is wrong. Only treat it as a problem if the assertions
  fail.
- Do not introduce `ClassSerializerInterceptor`, a new response DTO class, or a `@CurrentUser()`
  decorator — those were considered in the refinement's open questions and explicitly decided against
  above to keep this change scoped to the one endpoint.
