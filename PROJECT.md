# home-page — Technical Reference

## What This Is
A personal browser homepage with bookmark groups, custom icons, and a configurable search bar. Deployed as a single Fly.io app (`sage-home-page`) that serves both the Express API and the built React frontend.

## Workflow
```yaml
deployments:
  prod:
    branch: master
```
No staging environment. No develop branch. Changes merge directly to master; `npm run deploy` builds and pushes to Fly.io.

## Intentional Deviations from STANDARDS.md
| Deviation | Reason |
|-----------|--------|
| Tailwind CSS v3 (not v4) | Project predates the v4 standard; uses `tailwind.config.js` + `postcss.config.js` |
| No staging environment | Personal tool — single prod is sufficient |
| No GitHub Actions CI/CD | Deployment is manual (`npm run deploy`); no automated pipeline |
| No tests | Personal hobby project; no test infrastructure |
| All routes in one file | Express routes live in `server/src/index.ts` rather than split by resource |
| Allowlist-based auth | New users must be in `AllowedEmail` table to log in; not open registration |

## Stack
| Layer | In Use |
|-------|--------|
| Frontend | React 18, TypeScript, Tailwind CSS v3, Vite |
| Backend | Express, TypeScript, Prisma ORM |
| Database | PostgreSQL (local: `home_page_dev` on `sage-shared-dev-postgres`; prod: `sage-shared-postgres` on Fly.io) |
| Auth | Google OAuth 2.0 via Passport.js + express-session (30-day sessions stored in Postgres via connect-pg-simple) |
| File Storage | AWS S3 (images proxied through Express via multer — never direct browser-to-S3) |
| Deployment | Fly.io — app: `sage-home-page`, region: `dfw` |

## Repo Structure
```
home-page/
├── client/                    # React frontend (Vite)
│   ├── public/search-engines/ # Search engine favicons (brave, ddg, google, bing, yahoo)
│   └── src/
│       ├── App.tsx            # Entire frontend — single component, no pages/ or routes/
│       ├── AccessDenied.tsx   # Shown when unauthorized Google account tries to log in
│       └── index.css          # Tailwind base styles
├── server/
│   └── src/
│       ├── index.ts           # All Express routes + middleware setup
│       └── lib/
│           ├── auth.ts        # Passport Google OAuth strategy + user serialization
│           ├── middleware.ts  # isAuthenticated guard
│           ├── prisma.ts      # PrismaClient singleton
│           └── s3.ts          # S3 upload helper (uploadToS3, deleteFromS3)
├── scripts/
│   ├── ensure-postgres.sh     # Starts sage-shared-dev-postgres if not running
│   ├── ensure-database.sh     # Creates home_page_dev DB if missing
│   └── setup-deployment.js   # One-time Fly.io setup guard (idempotent via .flyio-setup-complete)
├── .env.example
├── .env.production.example
├── Dockerfile
├── docker-compose.yml
├── fly.toml
└── tailwind.config.js
```

## Data Models

### User
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | PK |
| email | String | unique |
| name | String? | |
| googleId | String? | unique; from Google profile |
| picture | String? | Google profile photo URL |
| isAdmin | Boolean | default false; hardcoded for joethedave@gmail.com |
| settings | Json? (JSONB) | pruned — only non-default values stored |
| createdAt / updatedAt | DateTime | |

### BookmarkGroup
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | PK |
| name | String | |
| userId | String | FK → User (cascade delete) |
| deleted | Boolean | soft delete, default false |
| createdAt / updatedAt | DateTime | |

### Bookmark
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | PK |
| url | String | |
| name | String | |
| image | String | S3 URL |
| orderId | Int | display order within group, default 0 |
| deleted | Boolean | soft delete, default false |
| userId | String | FK → User (cascade delete) |
| groupId | String | FK → BookmarkGroup (cascade delete) |
| createdAt / updatedAt | DateTime | |

### AllowedEmail
| Field | Type | Notes |
|-------|------|-------|
| id | String (UUID) | PK |
| email | String | unique |
| createdAt | DateTime | |

## API Endpoints

### Auth
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/auth/google` | — | Initiate Google OAuth |
| GET | `/api/auth/google/callback` | — | OAuth callback; redirects to `/access-denied` if email not allowlisted |
| GET | `/api/auth/me` | session | Returns user + merged settings (defaults applied) |
| POST | `/api/auth/logout` | session | Destroys session |

### User Settings
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| PATCH | `/api/user/settings` | session | Partial update; validates + prunes defaults before write |

### Groups
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/groups` | session | All non-deleted groups for current user, ordered by createdAt |
| POST | `/api/groups` | session | Create group |
| PUT | `/api/groups/:id` | session | Rename group |
| DELETE | `/api/groups/:id` | session | Soft delete; blocked if `?selectedGroupId` matches |
| POST | `/api/groups/:id/restore` | session | Restore soft-deleted group |

### Bookmarks
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/bookmarks` | session | Filter by `?groupId=`; ordered by orderId |
| POST | `/api/bookmarks` | session | `multipart/form-data`; optional image → S3; appends to end of group |
| PUT | `/api/bookmarks/:id` | session | `multipart/form-data`; optional replacement image → S3 |
| DELETE | `/api/bookmarks/:id` | session | Soft delete |
| POST | `/api/bookmarks/:id/restore` | session | Restore soft-deleted bookmark |
| PATCH | `/api/bookmarks/:id/move` | session | Move to different group (appended to end) |
| POST | `/api/bookmarks/reorder` | session | Body: `{ bookmarkIds: string[] }` in new display order |

### Admin (Allowed Emails)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/allowed-emails` | admin | Lists all allowed emails |
| POST | `/api/allowed-emails` | admin | Add email to allowlist |
| DELETE | `/api/allowed-emails/:id` | admin | Remove email from allowlist |

### Utility
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | DB connectivity check; returns `{ status, database, timestamp }` |

## Frontend Routes
No React Router — the app is a single-page component in `App.tsx`. The server's catch-all serves `index.html` for all non-API paths.

| Path | Notes |
|------|-------|
| `/` | Main page — login screen or bookmark homepage depending on auth state |
| `/access-denied` | Rendered by `AccessDenied.tsx` when an unauthorized Google account tries to log in |

## Environment Variables
| Variable | Where Set | Notes |
|----------|-----------|-------|
| `DATABASE_URL` | `.env` / Fly secret | PostgreSQL connection string |
| `PORT` | `.env` / fly.toml | Express listen port (default 3001) |
| `VITE_PORT` | `.env` | Vite dev server port (default 3000) |
| `GOOGLE_CLIENT_ID` | `.env` / Fly secret | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | `.env` / Fly secret | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | `.env` / Fly secret | OAuth redirect URI |
| `SESSION_SECRET` | `.env` / Fly secret | express-session signing key |
| `NODE_ENV` | `.env` / fly.toml | `development` or `production` |
| `AWS_ACCESS_KEY_ID` | `.env` / Fly secret | S3 credentials |
| `AWS_SECRET_ACCESS_KEY` | `.env` / Fly secret | S3 credentials |
| `AWS_REGION` | `.env` / Fly secret | S3 region (default `us-east-1`) |
| `AWS_S3_BUCKET` | `.env` / Fly secret | S3 bucket name |
| `FRONTEND_URL` | Fly secret (prod only) | CORS origin in production |

## Non-Obvious Conventions
- **Admin detection**: `joethedave@gmail.com` is hard-coded in `server/src/lib/auth.ts`; receives `isAdmin: true` on first login.
- **Settings pruning**: Settings JSON stores only non-default values. `sanitizeSettingsPatch` validates incoming fields against known enums; `pruneDefaultSettings` strips values that match the server-side defaults before writing.
- **Graceful settings migration**: `isMissingSettingsColumnError` catches Prisma P2022 errors on the `User.settings` column and returns a 503 instead of 500 — used during live migrations when the column might not yet exist.
- **Soft deletes with undo**: Both Bookmarks and BookmarkGroups use `deleted: boolean`. Restore endpoints exist for both; always filter `deleted: false` in read queries.
- **New user bootstrap**: On first Google login, a `BookmarkGroup` named `"main"` is automatically created for the user.
- **S3 key structure**: `{dev|prod}/{userEmail}/{uuid}.{ext}` — all images in a single bucket, namespaced by environment and user email.
- **Session store**: `connect-pg-simple` creates a `session` table in Postgres at runtime (`createTableIfMissing: true`). Never include this table in test truncations.

## Tagged Versions
- `1.1.0` — current — Search bar + settings modal; bookmark groups; S3 image storage; allowlist-based auth
