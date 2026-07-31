# server

The **pp-track** backend — a [Fastify 5](https://fastify.dev/) API with [Prisma 7](https://www.prisma.io/) and PostgreSQL. It owns the database, prices, and all persistent data; the web app talks to it over HTTP.

## Stack

- **Fastify 5** with `fastify-type-provider-zod` — Zod schemas drive request validation and response serialization
- **Prisma 7** via `@prisma/adapter-pg` (driver-adapter mode, not the default engine)
- **PostgreSQL**
- **[yahoo-finance2](https://github.com/gadicc/node-yahoo-finance2)** for stock and CEDEAR prices, plus [dolarapi](https://dolarapi.com) / [ArgentinaDatos](https://argentinadatos.com) for dólar MEP and CCL rates

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
pnpm test               # vitest run
pnpm import-portfolio <path-to-csv> <user-email>   # CSV importer (you supply the CSV — see scripts/import-portfolio.ts for the format)
pnpm backfill-currency [--dry-run]                 # one-time currency migration backfill (see below)
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
| `LOG_LEVEL`           | Pino log level (optional, defaults to `info`)                                    |

## Project layout

```
src/
  index.ts              # listen + graceful shutdown
  app.ts                # buildApp(): plugins, error handler, routes, /health
  env.ts                # startup environment validation
  http-error.ts         # error carrying an intentional HTTP status
  prisma-client.ts      # Prisma client factory (driver adapter)
  plugins/
    prisma.ts           # decorates the app with `prisma`, disconnects onClose
    auth.ts             # verifies the INTERNAL_API_SECRET and x-user-id headers
  routes/               # all mounted under the /api prefix
    prices.ts
    portfolios.ts
    transactions.ts
    assets.ts
    users.ts
  services/
    yahoo-finance.ts    # price lookups + BYMA ticker variants
    fx-rates.ts         # dólar MEP / CCL rates, cached per rate and calendar day
    currency.ts         # ARS/MEP/CCL derivation from a stored amount + rate snapshot
    prices.ts           # price cache, snapshot pruning, currency conversion
    assets.ts           # asset registry + canonical CEDEAR ticker resolution
    holdings.ts         # three-currency cost-basis replay
    authorization.ts    # portfolio/transaction ownership guards
prisma/
  schema.prisma         # data model + migrations
scripts/
  import-portfolio.ts   # CSV → database importer
  backfill-currency.ts  # one-time backfill for the ARS/MEP/CCL migration
backups/                # local pg_dump output (gitignored)
```

An unauthenticated `GET /health` endpoint reports server and database status.

## Data model

See [`prisma/schema.prisma`](./prisma/schema.prisma). Core models:

- **User** → many **Portfolio**, many **Watchlist**
- **Portfolio** → many **Holding**, many **Transaction**
- **Asset** — normalized asset registry (ticker + exchange unique). A CEDEAR is stored under its peso BYMA ticker (`SPY.BA`); the `D` and `C` variants are quote symbols for the same row
- **Holding** — current position per portfolio/asset pair: quantity plus an average cost basis in each of ARS, MEP and CCL
- **Transaction** — individual buy / sell / dividend / fee records, stored in the currency they were entered in with the MEP and CCL rates for that date
- **PriceSnapshot** — historical prices, indexed on `(assetId, recordedAt)`

All monetary quantities use `Decimal(18,8)`; primary keys are UUIDs.

### Currency migration

`20260731140000_cedear_multi_currency` reshapes the schema and merges duplicated CEDEAR assets, but the peso prices and rate snapshots need the FX rate API, so they are restored separately:

```sh
pnpm migrate:deploy               # or `pnpm migrate` in development
pnpm backfill-currency --dry-run  # preview every row that would change
pnpm backfill-currency            # apply
```

The backfill is idempotent and re-runnable. It prints every transaction it touches, which matters for two cases it cannot decide on its own: trades that were `USD` become `MEP`, so anything held in an **offshore** broker needs reclassifying to CCL by hand; and imported holdings with no backing transactions only ever had a dollar figure, so their ARS and CCL bases are approximated at the rates of their earliest transaction.

`cedear_migration_log` records what each affected transaction looked like beforehand — the only remaining record of which trades were rewritten, since the variant asset rows are deleted. Safe to drop once the restored prices look right.

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
