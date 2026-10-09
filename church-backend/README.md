# Church Service Management System — Backend

Phases **0 through 3** of the roadmap: project bootstrap, **Auth**, **RBAC**
(Roles/Permissions/Scopes + per-user overrides), **Users**, **Devices &
Sessions**, **Audit Log**, and now **Stages/Classes**, **Children/Parents**,
and **Servants/Stage Assignments**. Later phases (Attendance, QR, iScore,
Confession, Weekly Service, Preparations, Notifications, Questions, Reports)
build on top of this without changing what's here — see
`church-system-architecture.md` for the full design.

## Stack

NestJS + TypeScript · PostgreSQL 16 via Prisma · Redis (wired for later
phases) · JWT access tokens + rotating refresh tokens · Argon2id.

## Requirements

- Node.js 20+ and npm
- Docker (for Postgres/Redis) — or point `DATABASE_URL` at your own Postgres 16

## Setup

```bash
npm install
cp .env.example .env          # edit JWT_ACCESS_SECRET before anything real
docker compose up -d          # starts Postgres + Redis
npm run prisma:migrate        # creates the schema (prompts for a migration name the first time)
```

Then apply the append-only trigger for `audit_logs` **once**, using the
migration's own SQL runner or `psql`:

```bash
docker compose exec -T db psql -U church -d church < prisma/manual/audit_append_only.sql
```

Seed the permission catalog, the 6 core roles, the default role→permission
matrix, and a bootstrap Super Admin:

```bash
npm run seed
```

This prints the bootstrap admin's username/password (from `.env`,
`SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`, default `admin` /
`ChangeMe!12345`). The account has `mustChangePassword = true`, so the very
first authenticated call must be `POST /auth/change-password`.

## Run

```bash
npm run start:dev
```

API is served at `http://localhost:3000/api/v1`.

## Try it

```bash
# 1. Login
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin","password":"ChangeMe!12345"}'

# -> { accessToken, refreshToken, mustChangePassword: true }

# 2. First call MUST be change-password (guard lets this one through)
curl -s -X POST http://localhost:3000/api/v1/auth/change-password \
  -H "Authorization: Bearer <accessToken>" -H 'Content-Type: application/json' \
  -d '{"currentPassword":"ChangeMe!12345","newPassword":"a-much-longer-real-password"}'

# 3. Now everything else is unlocked
curl -s http://localhost:3000/api/v1/auth/me -H "Authorization: Bearer <accessToken>"
curl -s http://localhost:3000/api/v1/users -H "Authorization: Bearer <accessToken>"
```

## Tests

```bash
npm test              # unit tests (RBAC scope-resolution logic, etc.)
npm run test:e2e       # auth flow against a real, migrated & seeded DB
```

## What's implemented

| Area | Endpoints |
|---|---|
| Auth | `login`, `refresh` (rotation + reuse detection), `logout`, `change-password`, `forgot-password`, `reset-password`, `me` |
| Users | CRUD, `disable`/`enable`, `logout-all`, `reset-password`, roles (`PUT /users/:id/roles`), permission overrides (`PUT /users/:id/permissions`), `sessions`, `devices` |
| Devices/Sessions | list, `revoke` (single), cascading revoke on disable/logout-all/password change |
| RBAC | Role → Permission → Scope, with per-user grant/deny overrides; effective permissions resolved server-side on every request (`src/rbac/resolve.ts`, unit-tested) |
| Audit | Every sensitive action is logged (`src/audit`); the table is DB-level append-only (see `prisma/manual/audit_append_only.sql`); `GET /audit-logs` |
| Stages/Classes | CRUD, `PUT /stages/:id/secretary` (closes the previous holder's assignment, keeps history), enable/disable, classes nested under a stage |
| Children | CRUD, `deactivate`/`reactivate`, `transfer` (closes the old `child_enrollments` row, opens a new one — never loses history), `timeline` (enrollment history now; attendance/confession/iScore events join in from Phase 6+), parent linking (`PUT /children/:id/parents`) |
| Parents | CRUD (`/parents`), independent of any one child |
| Servants | CRUD, enable/disable, `PUT /servants/:id/assignments` (replaces stage/class assignments; removed ones are ENDED, not deleted) |

**Scope enforcement (new in Phase 3):** permissions like `EDIT_CHILDREN` with
`OWN_STAGE` scope are re-checked against the *specific* stage id on every
write (`src/common/scope.ts`, unit-tested) — a stage secretary's grant is
therefore actually confined to their stage(s), not just gated by "do they
have this permission at all". List endpoints filter server-side the same way
(`stageScopeWhere`), so a stage secretary's `GET /children` never returns
another stage's children even if they don't pass a `stageId` filter.

**Enforced everywhere, per the architecture doc's Security Model:**
- Every permission check happens server-side (`PermissionsGuard`); the
  `permissions` map returned by `/auth/me` is for the client to decide what
  to *show*, never a security boundary.
- Access tokens are re-validated against the live session + `token_version`
  on every request, so "disable user" / "logout everywhere" take effect
  immediately, not just when the token expires.
- Refresh tokens rotate on every use; replaying an old one revokes the whole
  session (theft/leak detection).
- The system can never be left without a Super Admin (`assertNotLastSuperAdmin`).
- `general_secretary` is enforced unique: assigning a new holder closes the
  previous assignment (history kept, not deleted).
- Passwords: Argon2id, timing-safe unknown-user path, lockout after N failed
  attempts (configurable), forced change on first login and after an admin
  reset.

## Not yet implemented (next phases)

Web Dashboard v1 (Phase 4), QR (Phase 5), Attendance + Offline Sync
(Phase 6), iScore (Phase 7), Confession (Phase 8), Weekly Service +
Preparations (Phase 9), Notifications (Phase 10), Anonymous Questions
(Phase 11), Reports/Export (Phase 12), Settings, Backups — all per the
roadmap in `church-system-architecture.md`, section I.
