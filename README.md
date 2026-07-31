# pp-track

A portfolio tracking application. Track investments across multiple portfolios, log buy/sell/fee transactions, and monitor asset prices for stocks and CEDEARs — in pesos or either kind of dollar.

## Features

- Multiple portfolios per user with a portfolio switcher
- Holdings with quantity and average cost basis, tracked in ARS, MEP and CCL at once
- Transaction log (buy / sell / dividend / fee records), each stored in the currency it was entered in
- Live and historical asset prices via [yahoo-finance2](https://github.com/gadicc/node-yahoo-finance2), with dólar MEP and CCL rates from [dolarapi](https://dolarapi.com) and [ArgentinaDatos](https://argentinadatos.com)
- Charts powered by Recharts
- OAuth sign-in (Google, Facebook) via NextAuth

### Currencies

Trades are recorded in one of three currencies — **ARS** (pesos), **MEP** (dollars settled locally) or **CCL** (dollars settled offshore, _contado con liquidación_) — and stored **exactly as entered**, alongside the MEP and CCL rates in effect on the trade date. The other two views are derived from that snapshot, so the amount actually paid is never lost.

Each holding therefore carries a cost basis in all three currencies: the amount really paid in each, rather than a single figure revalued at today's rate. The dashboard switches between them, so the ARS view shows real peso performance instead of one distorted by exchange-rate moves since purchase.

A CEDEAR is a single asset no matter which of its BYMA symbols you trade — `SPY.BA` (pesos), `SPYD.BA` (MEP) and `SPYC.BA` (CCL) all resolve to one position.

## Tech stack

[Turborepo](https://turbo.build/) monorepo managed with `pnpm` workspaces.

- **[`apps/web`](./apps/web)** — Next.js 16 frontend (React 19, Tailwind CSS v4, shadcn/ui, NextAuth)
- **[`apps/server`](./apps/server)** — Fastify 5 backend with Prisma 7 + PostgreSQL
- **`packages/api-contract`** — Zod schemas defining the HTTP contract; the server validates against them and the web app infers its types from them
- **`packages/eslint-config`** — Shared ESLint configs
- **`packages/typescript-config`** — Shared `tsconfig.json` presets

The web app talks to the server over HTTP; requests are authenticated with a shared `INTERNAL_API_SECRET`.

## Prerequisites

- Node.js >= 20.9 (see [`.nvmrc`](./.nvmrc))
- pnpm 9 (`corepack enable`)
- A running PostgreSQL instance — or use the bundled compose file:

```sh
docker compose up -d              # Postgres 17 on localhost:5432
```

## Getting started

```sh
# 1. Install dependencies (from the repo root)
pnpm install

# 2. Configure environment variables (see each app's README)
#    apps/server/.env       — see apps/server/README.md
#    apps/web/.env.local     — see apps/web/README.md

# 3. Apply database migrations and generate the Prisma client
#    (also seeds a demo user/portfolio in development)
pnpm migrate

# 4. Start all apps
pnpm dev
```

- Web app: http://localhost:3000
- API server: http://localhost:3001

For app-specific setup, scripts, environment variables, and layout, see the per-app docs:

- [`apps/server/README.md`](./apps/server/README.md) — backend, Prisma, database backups
- [`apps/web/README.md`](./apps/web/README.md) — frontend, OAuth

## Commands

Run from the repo root:

```sh
pnpm dev                          # start all apps
pnpm dev --filter=web             # start only the Next.js frontend (port 3000)
pnpm dev --filter=server          # start only the Fastify server (port 3001)
pnpm build                        # build all apps
pnpm lint                         # lint all packages
pnpm check-types                  # type-check all packages
pnpm test                         # run all test suites
pnpm format                       # prettier-format all TS/TSX/MD files
pnpm migrate                      # run Prisma migrations against the dev database
```

## Data model

Core models live in [`apps/server/prisma/schema.prisma`](./apps/server/prisma/schema.prisma): **User**, **Portfolio**, **Asset**, **Holding**, **Transaction**, **PriceSnapshot**, and **Watchlist**. All monetary quantities use `Decimal(18,8)` and primary keys are UUIDs. See the [server README](./apps/server/README.md#data-model) for the relationships.

A **Transaction** keeps its entered `price`, `fee` and `currency` untouched, plus the `mepRate` / `cclRate` that applied on its date. A **Holding** stores `avgCostBasis` (MEP) together with `avgCostBasisArs` and `avgCostBasisCcl`, all three rebuilt by replaying the position's transactions in chronological order.

## License

This project is **source-available** under the [Business Source License 1.1](./LICENSE) — not an OSI open-source license.

- You may view, modify, and self-host it for personal and internal, non-commercial use.
- You may **not** offer it to third parties as a competing hosted/commercial service before the Change Date.
- On **2030-06-15** it automatically converts to the **Apache License 2.0**.

For commercial use beyond the grant, contact garistozm@outlook.com. See [`LICENSE`](./LICENSE) for the full terms.
