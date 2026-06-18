# Clock Keeper

Clock Keeper is a Vercel-ready Express time tracker with:
- account signup and signin
- clock in / clock out
- lunch and break tracking
- CSV export and re-export
- server-backed sessions
- Postgres persistence for production deployments

## Project structure

- `public/`: static browser assets
- `src/index.js`: exported Express app for Vercel
- `src/routes/`: API routes
- `src/lib/`: auth, database, CSV, and shift helpers
- `server.js`: local Express runner

## Local development

This refactor expects a Postgres connection string.

1. Create a `.env` file or export an environment variable:

```bash
export DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DATABASE'
```

2. Start the app:

```bash
npm start
```

## Vercel deployment

### Import settings

- Framework Preset: `Express.js`
- Root Directory: leave default
- Build Command: leave blank/default
- Output Directory: leave blank
- Install Command: leave default

### Environment variables

Add one of these Postgres connection variables in Vercel Project Settings:

- `DATABASE_URL`
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `SESSION_COOKIE_NAME` optional, defaults to `clock_keeper_session`
- `SESSION_TTL_SECONDS` optional, defaults to `2592000`

### Database

Use a hosted Postgres database. A Vercel Marketplace Postgres provider is the recommended fit.

The app automatically creates its required tables at startup.

## GitHub and Vercel flow

1. Push this repo to GitHub.
2. Import the repo into Vercel.
3. Add `DATABASE_URL`.
4. Deploy.
