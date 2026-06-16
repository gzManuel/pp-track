# pp-track

A portfolio tracking application. Track investments across multiple portfolios, log buy/sell/fee transactions, and monitor asset prices for stocks and CEDEARs.

## Features

- Multiple portfolios per user with a portfolio switcher
- Holdings with quantity and average cost basis per portfolio/asset
- Transaction log (buy / sell / fee records)
- Live and historical asset prices via [yahoo-finance2](https://github.com/gadicc/node-yahoo-finance2) (stocks and CEDEARs, USD via `.BA` D-suffix tickers)
- Charts powered by Recharts
- OAuth sign-in (Google, Facebook) via NextAuth

## Tech stack

[Turborepo](https://turbo.build/) monorepo managed with `pnpm` workspaces.

- **`apps/web`** — Next.js 16 frontend (React 19, Tailwind CSS v4, shadcn/ui, NextAuth)
- **`apps/server`** — Fastify 5 backend with Prisma 7 + PostgreSQL
- **`packages/ui`** — Shared React component library (`@repo/ui`)
- **`packages/eslint-config`** — Shared ESLint configs
- **`packages/typescript-config`** — Shared `tsconfig.json` presets

The web app talks to the server over HTTP; requests are authenticated with a shared `INTERNAL_API_SECRET`.

## Prerequisites

- Node.js >= 18
- pnpm 9 (`corepack enable`)
- A running PostgreSQL instance

## Getting started

```sh
# 1. Install dependencies (from the repo root)
pnpm install

# 2. Configure environment variables (see below)
#    apps/server/.env  and  apps/web/.env.local

# 3. Apply database migrations and generate the Prisma client
pnpm migrate

# 4. Start all apps
pnpm dev
```

- Web app: http://localhost:3000
- API server: http://localhost:3001

## Environment variables

### `apps/server/.env`

| Variable              | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string (driver-adapter mode)       |
| `INTERNAL_API_SECRET` | Shared secret used to authenticate requests from the web |
| `PORT`                | Server port (optional, defaults to `3001`)               |
| `HOST`                | Bind host (optional, defaults to `0.0.0.0`)              |

Prisma uses `@prisma/adapter-pg` (driver-adapter mode, not the default engine).

### `apps/web/.env.local`

| Variable                                | Description                                       |
| --------------------------------------- | ------------------------------------------------- |
| `SERVER_API_URL`                        | Base URL of the Fastify server (e.g. `http://localhost:3001`) |
| `INTERNAL_API_SECRET`                   | Must match the server's value                     |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET`      | NextAuth base URL and session secret              |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`     | Google OAuth credentials                  |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | Facebook OAuth credentials                |

## Commands

Run from the repo root:

```sh
pnpm dev                          # start all apps
pnpm dev --filter=web             # start only the Next.js frontend (port 3000)
pnpm dev --filter=server          # start only the Fastify server (port 3001)
pnpm build                        # build all apps
pnpm lint                         # lint all packages
pnpm check-types                  # type-check all packages
pnpm format                       # prettier-format all TS/TSX/MD files
pnpm migrate                      # run Prisma migrations against the dev database
```

### Prisma (run from `apps/server`)

```sh
pnpm migrate                      # apply migrations and regenerate the client (dev)
pnpm migrate:deploy               # apply migrations without prompting (production)
pnpm prisma generate              # regenerate the client without migrating
pnpm prisma studio                # open Prisma Studio
```

## Data model

Core models live in `apps/server/prisma/schema.prisma`:

- **User** → many **Portfolio**, many **Watchlist**
- **Portfolio** → many **Holding**, many **Transaction**
- **Asset** — normalized asset registry (ticker + exchange unique); referenced by Holding, Transaction, PriceSnapshot, Watchlist
- **Holding** — current position (quantity + average cost basis) per portfolio/asset pair
- **Transaction** — individual buy/sell/fee records
- **PriceSnapshot** — historical price records, indexed on `(assetId, recordedAt)`

All monetary quantities use `Decimal(18,8)`; UUIDs are used for all primary keys.

## License

This project is **source-available** under the [Business Source License 1.1](./LICENSE) — not an OSI open-source license.

- You may view, modify, and self-host it for personal and internal, non-commercial use.
- You may **not** offer it to third parties as a competing hosted/commercial service before the Change Date.
- On **2030-06-15** it automatically converts to the **Apache License 2.0**.

For commercial use beyond the grant, contact garistozm@outlook.com. See [`LICENSE`](./LICENSE) for the full terms.
