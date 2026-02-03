# Home Page

Custom browser homepage with bookmarks organized in groups.

## Repository

- GitHub: https://github.com/JoeTheDave/home-page
- Clone: `git clone git@github.com:JoeTheDave/home-page.git`

## Setup

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env` and fill in:

- Google OAuth credentials (get from Google Cloud Console)
- AWS S3 credentials (for bookmark images)

Run the app:

```bash
npm run dev
```

Opens on `http://localhost:3000`

## Stack

- bootstrapped from https://www.npmjs.com/package/raise-the-bones
- React + TypeScript + Vite
- Express + Prisma
- PostgreSQL
- AWS S3
