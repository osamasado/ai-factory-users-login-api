# Login History — Refinement (Stage 1 Survey)

## Feature

Login history: on a successful `POST /auth/login`, record the login event for that user. Add a
new endpoint `GET /users/:id/login-history` that returns that user's login timestamps (empty
array if they've never logged in, 404 if the user id doesn't exist).

## Relevant routes

- **`POST /auth/login`** — `src/auth/auth.controller.ts:19-25`, `AuthController.login()`.
  - No `@UseGuards` (public route, as expected for login).
  - DTO: `LoginDto` — `src/auth/dto/login.dto.ts:3-9` (`email` w/ `@IsEmail`, `password` w/ `@IsString`).
  - Delegates to `AuthService.login(email, password)` — `src/auth/auth.service.ts:28-44`.
    - Throws `UnauthorizedException('Invalid credentials')` on bad email/password (`:31`, `:35`).
    - On success, signs a JWT via `@nestjs/jwt`'s `JwtService.sign({ id, email, role })` (`:37-41`)
      and returns `{ access_token: token }` (`:43`).
    - **No login event/timestamp is recorded anywhere today.**

- **`GET /users/:id`** — `src/users/users.controller.ts:28-31`, `UsersController.findOne()`. This
  is the existing path-param pattern most relevant to `GET /users/:id/login-history`:
  - `@Param('id') id: string` — plain string, no `ParseIntPipe`/UUID pipe.
  - No `@UseGuards` on this route.
  - Delegates to `UsersService.findOne(id)` — `src/users/users.service.ts:28-34`, which throws
    `NotFoundException('User not found')` (`:31`) if absent, else returns the plain `User` object
    (includes `password` field — no response DTO/serialization applied anywhere in this controller).

- **Other `UsersController` routes** (`src/users/users.controller.ts`), for pattern context:
  - `POST /users` (`:17-20`), `GET /users` (`:23-26`, guard commented out at `:22`),
    `PUT /users/:id` (`:33-36`), `DELETE /users/:id` (`:38-41`) — none of these have active guards.
  - `GET /users/admin-only` (`:45-48`) is the **only** route with an active guard:
    `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` (`:43-44`).

- **404 handling convention**: `NotFoundException` (from `@nestjs/common`) thrown from the
  **service layer**, not the controller — see `users.service.ts:31` (`findOne`) and `:44`
  (`remove`, same message, separate manual check). No global exception filters registered
  (`src/main.ts:7-12` only sets a global `ValidationPipe`). `AuthService` never uses
  `NotFoundException`; its own failures use `UnauthorizedException`.

- **Guard/auth convention**: `JwtAuthGuard` — `src/auth/auth/auth.guard.ts:1-5`
  (`extends AuthGuard('jwt')`). `JwtStrategy` — `src/auth/strategies/jwt/jwt.strategy.ts:1-22`,
  hardcoded secret `'MY_SECRET_KEY'` (also duplicated in `src/auth/auth.module.ts:13`),
  `validate()` returns `{ userId, email, role }` becoming `request.user`. `RolesGuard` —
  `src/auth/roles/roles.guard.ts:1-21`; `Roles` decorator — `src/auth/roles/roles.decorator.ts:1-4`.
  Guards are used **inconsistently/sparingly** in this codebase: only the static `admin-only`
  route actively enforces auth; every `:id`-scoped route (`GET/PUT/DELETE /users/:id`) currently
  has **no guard at all**. There is no existing precedent of an active guard on a `:id` param
  route to copy from — this is an open question for the planning stage, not a settled convention.

- **Module wiring**: `AppModule` (`src/app.module.ts:7-12`) imports both `UsersModule` and
  `AuthModule`; they are **not** cross-wired — `AuthModule` (`src/auth/auth.module.ts:9-20`) does
  not export `AuthService` or import `UsersModule`/`UsersService`, and vice versa.

## Relevant data layer

- **No database is wired in.** `prisma/schema.prisma` contains only generator/datasource
  boilerplate — **zero `model` blocks**:
  ```prisma
  generator client {
    provider = "prisma-client"
    output   = "../src/generated/prisma"
  }
  datasource db {
    provider = "postgresql"
  }
  ```
  No migrations directory exists; `src/generated/prisma` doesn't exist (client never generated);
  `.env` has `DATABASE_URL=` (empty); repo-wide grep for `PrismaService|PrismaModule|PrismaClient`
  in `src` returns zero matches. Prisma is scaffolded only, not connected to any code path. The
  next stage must not assume a real database exists.

- **Authoritative state today is two separate, disconnected in-memory arrays:**
  - `UsersService.users` — `src/users/users.service.ts:9` (`private users: User[] = []`), backs
    all `/users` CRUD routes.
  - `AuthService.users` — `src/auth/auth.service.ts:8` (`private users: User[] = []`), backs
    `/auth/register` and `/auth/login`.
  - These are **independent arrays in independent services/modules** — a user registered via
    `POST /auth/register` is invisible to `UsersService.findOne`/`findAll` (and vice versa for
    users created via `POST /users`). **This directly affects the feature**: a login event
    happens against `AuthService`'s store, while the existence check for
    `GET /users/:id/login-history` would naturally use `UsersService.findOne`, which may not know
    about that user at all.

- **User record shape** — `src/users/interfaces/user.interface.ts:1-11`:
  ```ts
  export enum Role { USER = 'user', ADMIN = 'admin' }
  export interface User {
    id: string;       // Date.now().toString() — not uuid, not auto-increment number
    name: string;
    email: string;
    password: string;
    role: Role;
  }
  ```
  `id` generated as `Date.now().toString()` in both `UsersService.create` (`users.service.ts:13`)
  and `AuthService.register` (`auth.service.ts:16`).

- **Login validation today** — `AuthService.login(email, password)`
  (`src/auth/auth.service.ts:28-44`): looks up user via
  `this.users.find(u => u.email === email)` against its own private array, validates password
  with `bcrypt.compare`, signs and returns a JWT. No timestamp/event is recorded on success.

- **No existing history/log structures**: repo-wide grep for
  `histor|timestamp|lastLogin|loginAt|loggedInAt|createdAt` across `src` and `prisma` returns
  zero matches — nothing tracking per-user event timestamps exists today.

- **Existing lookup/existence-check methods** (candidates to reuse or model after):
  - `UsersService.findOne(id: string)` — `users.service.ts:28-34`; the only existing id-based
    existence check with 404 semantics.
  - `UsersService.findAll()` (`:24-26`), `update(id, dto)` (`:36-40`, calls `findOne` internally),
    `remove(id)` (`:42-48`, own manual `findIndex` + 404, does not reuse `findOne`).
  - Exposed via `UsersController.findOne` at `GET /users/:id` (`users.controller.ts:28-31`).
  - **No equivalent lookup-by-id exists in `AuthService`** — only lookup-by-email in `login`, no
    `findOne`/`findById` method there at all.

## Test setup

- **Running tests**: unit tests via `npm run test` (Jest, config in `package.json`'s `"jest"`
  block, `rootDir: "src"`, `testRegex: ".*\\.spec\\.ts$"`, `transform` via `ts-jest`). E2E tests
  via `npm run test:e2e` (`jest --config ./test/jest-e2e.json`; that config has `rootDir: "."`
  relative to `test/`, `testRegex: ".e2e-spec.ts$"`).

- **Unit test convention** — all existing `*.spec.ts` are unmodified Nest-CLI scaffolding (no
  real mocking/DI overrides/behavioral assertions beyond "should be defined"). Representative
  example: `src/users/users.controller.spec.ts:7-13`:
  ```ts
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
    }).compile();
    controller = module.get<UsersController>(UsersController);
  });
  ```
  Single top-level `describe`, one `it('should be defined', ...)`, no providers/mocks supplied
  (works because Nest auto-resolves concrete providers when nothing is overridden). **No existing
  example anywhere in the repo of `jest.fn()`/`useValue`/`overrideProvider` mocking** — a
  login-history unit spec asserting real behavior would be greenfield for that pattern here. A
  new spec for this feature would most likely live at
  `src/auth/auth.service.spec.ts` / `src/users/users.service.spec.ts` /
  `src/users/users.controller.spec.ts` (whichever files get new methods), following Nest's
  `Test.createTestingModule` structure.

- **E2E test convention** — only one e2e spec exists today,
  `test/app.e2e-spec.ts:10-28`, and it covers the trivial root route only (no auth/users e2e spec
  exists yet):
  ```ts
  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  afterEach(async () => {
    await app.close();
  });
  ```
  Imports the whole real `AppModule` (no mocking), uses `supertest`, bootstraps/tears down the
  app per-test in `beforeEach`/`afterEach` (not `beforeAll`/`afterAll`). A new e2e spec for this
  feature would likely be `test/auth-login-history.e2e-spec.ts` or similar, imitating this file's
  structure.

- **No test helpers/fixtures exist** — no `test/helpers`, `test/fixtures`, or reusable
  register/login-via-supertest utility anywhere in the repo. A login-history e2e test would need
  to register/login inline via raw `supertest` calls against the real `POST /auth/register` and
  `POST /auth/login` routes.

## Open questions / risks

1. **Split user stores**: `AuthService` and `UsersService` each hold their own independent
   in-memory `users` array with no shared state. A login event recorded in `AuthService` (where
   login happens) must somehow be visible to whatever backs `GET /users/:id/login-history`
   (naturally a `UsersService`/`UsersController` route). The planning stage must decide how to
   bridge this — e.g., share a store, wire the modules together, move login history into a
   structure both can reach, or otherwise reconcile the two-store split — since today a user who
   registered via `/auth/register` may not even exist from `UsersService`'s point of view.
2. **No persistence layer**: Prisma has no models; everything today is in-memory and process-
   lifetime only. Planning stage must decide whether login history should also be an in-memory
   structure (consistent with current codebase state) or whether this feature is the trigger to
   introduce real Prisma models — this materially changes scope.
3. **404 vs empty-array semantics**: the feature spec requires 404 for a nonexistent user id but
   empty array for a real user with no login history — this maps cleanly onto the existing
   `UsersService.findOne` 404 convention, but only if the login-history data can be looked up
   keyed by the same `id` that `UsersService` recognizes (see risk #1).
4. **Guard/auth requirements unspecified**: the feature description doesn't say whether
   `GET /users/:id/login-history` should be authenticated. Existing codebase convention is
   inconsistent — no `:id`-scoped route currently has an active guard, and the one guarded route
   (`admin-only`) is role-gated, not a precedent for per-user data access control (e.g., should a
   user only be able to view their own login history, or is any authenticated/any caller fine?).
   Planning stage must decide and justify.
5. **User id type/generation**: ids are `Date.now().toString()`, not UUIDs — collision risk is
   low but real if two users are created in the same millisecond across the two disconnected
   services; not this feature's problem to fix, but worth the planning stage being aware of when
   designing how login-history records key themselves to a user id.
6. **No response DTO/serialization exists** on `GET /users/:id` today (raw `User` object including
   `password` is returned) — planning stage should decide whether the new endpoint's response
   shape (an array of timestamps) needs a DTO at all, and whether this feature is an opportunity
   to also fix the existing password-leak issue on `findOne` (out of scope unless explicitly
   requested, but worth flagging).
7. **No test mocking precedent**: since no existing spec mocks a service/provider, the planning
   stage should decide whether new unit tests for this feature introduce `jest.fn()`/`useValue`
   mocking for the first time in this repo, or continue the "real DI, no mocks" pattern used so
   far (which may be harder to assert timestamp-recording behavior against cleanly).
