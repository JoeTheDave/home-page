# home-page — Vision

## Purpose
A personal browser homepage that replaces the default new-tab page. Organizes bookmarks into named groups with optional custom icons, includes a configurable search bar (Brave, DuckDuckGo, Google, Bing, Yahoo), and lets the user personalize the color theme and light/dark mode. Multi-user by design, with Google OAuth login and an admin-managed allowlist controlling who can access the app.

## Target User
Joe — primarily for personal use. Secondary users are anyone Joe explicitly adds to the allowed-email list (family, close colleagues).

## Value Proposition
Full control over the new-tab experience without relying on browser extensions or third-party homepage services. Bookmark icons are custom images hosted on S3, groups keep things organized, and the whole thing is self-hosted on Fly.io so it's always available from any browser.

## Business Model
None. Personal tool — no revenue model.

## Competitive Landscape
Browser extensions (Momentum, New Tab Override), built-in browser bookmarks. Differentiator: full customization (image icons, groups, search engine choice, theme) and no dependency on an extension ecosystem.

## Roadmap
MVP shipped (v1.1.0):
- Bookmark groups with CRUD
- Custom images via S3
- Google OAuth + allowlist access control
- Search bar with 5 engine options
- Light/dark mode + background color picker

Post-MVP ideas:
- Drag-and-drop reordering (orderId field exists; no drag UX yet)
- Bookmark import/export
- Keyboard shortcuts

## Out of Scope (Strategic)
- Public SaaS / multi-tenant product
- Mobile app
- Browser extension wrapper
