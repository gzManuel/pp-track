# server

The **pp-track** backend — a [Fastify 5](https://fastify.dev/) API with [Prisma 7](https://www.prisma.io/) and PostgreSQL. It owns the database, prices, and all persistent data; the web app talks to it over HTTP.

## Stack

- **Fastify 5** with `fastify-type-provider-zod` — Zod schemas drive request validation and response serialization
- **Prisma 7** via `@prisma/adapter-pg` (driver-adapter mode, not the default engine)
- **PostgreSQL**
- **[yahoo-finance2](https://github.com/gadicc/node-yahoo-finance2)** for stock and CEDEAR prices

## Getting started

From the repo root, `pnpm install`. Then from this directory:

```sh
cp .env.example .env              # then fill in the values
pnpm migrate                      # apply migrations + generate the Prisma client
pnpm dev                          # start on http://localhost:3001
```

Or run it alongside the rest of the stack with `pnpm dev --filter=server` from the repo root.

## Scripts

```sh
pnpm dev                # tsx watch — reload on change
pnpm build              # tsc → dist/
pnpm start              # run the compiled dist/index.js
pnpm migrate            # prisma migrate dev (apply + regenerate client)
pnpm migrate:deploy     # prisma migrate deploy (production, no prompts)
pnpm lint               # eslint (max-warnings 0)
pnpm check-types        # tsc --noEmit
pnpm import-portfolio   # import scripts/portfolio.csv into the database
```

Direct Prisma access (e.g. `pnpm prisma studio`, `pnpm prisma generate`) works from this directory too.

## Environment

Copy `.env.example` to `.env` and set:

| Variable              | Description                                                                      |
| --------------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string (driver-adapter mode)                               |
| `INTERNAL_API_SECRET` | Shared secret authenticating requests from the web app; must match the web value |
| `PORT`                | Server port (optional, defaults to `3001`)                                       |
| `HOST`                | Bind host (optional, defaults to `0.0.0.0`)                                      |

## Project layout

```
src/
  index.ts              # Fastify bootstrap: plugins, route registration, /health
  prisma.ts             # Prisma client instance
  plugins/
    prisma.ts           # decorates the app with `prisma`, disconnects onClose
    auth.ts             # verifies the INTERNAL_API_SECRET on incoming requests
  routes/               # all mounted under the /api prefix
    prices.ts
    portfolios.ts
    assets.ts
    users.ts
  services/
    yahoo-finance.ts    # price lookups via yahoo-finance2
    mep.ts              # USD/ARS (MEP) conversion
prisma/
  schema.prisma         # data model + migrations
scripts/
  import-portfolio.ts   # CSV → database importer
backups/                # local pg_dump output (gitignored)
```

An unauthenticated `GET /health` endpoint reports server and database status.

## Data model

See [`prisma/schema.prisma`](./prisma/schema.prisma). Core models:

- **User** → many **Portfolio**, many **Watchlist**
- **Portfolio** → many **Holding**, many **Transaction**
- **Asset** — normalized asset registry (ticker + exchange unique)
- **Holding** — current position (quantity + average cost basis) per portfolio/asset pair
- **Transaction** — individual buy / sell / fee records
- **PriceSnapshot** — historical prices, indexed on `(assetId, recordedAt)`

All monetary quantities use `Decimal(18,8)`; primary keys are UUIDs.

## Database backups

Create a compressed backup with `pg_dump` (adjust connection details to match your `DATABASE_URL`):

```sh
pg_dump -h localhost -p 5432 -U <user> -d <database> -Fc \
  -f "backups/<database>_$(date +%Y%m%d_%H%M%S).dump"
```

Restore into an existing database:

```sh
pg_restore -h localhost -p 5432 -U <user> -d <database> --clean --if-exists <file>.dump
```

The `backups/` directory is gitignored.
