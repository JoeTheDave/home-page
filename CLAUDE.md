# home-page — Claude Code Context

## Read these first
- `VISION.md` — what this app is and why
- `PROJECT.md` — how it's built, deployed, and what conventions apply

## Critical conventions for this project
- **Admin hardcode**: `joethedave@gmail.com` is hardcoded as admin in `server/src/lib/auth.ts`. Do not remove this unless explicitly asked.
- **Tailwind v3**: This project uses Tailwind v3 (with `tailwind.config.js` + `postcss.config.js`), NOT v4. Do not upgrade unless asked.
- **Soft deletes**: Bookmarks and BookmarkGroups are soft-deleted (`deleted: true`). Always filter by `deleted: false` in read queries unless restoring.
- **Allowlist auth**: Users must exist in `AllowedEmail` table to log in. New users are never auto-admitted — they must be added via the admin panel.

## Local dev quickstart
```bash
npm install
cp .env.example .env   # fill in Google OAuth + AWS + session secret
npm run dev            # ensures postgres, runs migrations, starts client + server concurrently
```

Client: http://localhost:3000  
Server: http://localhost:3001
