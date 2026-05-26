# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**pp-track** is a portfolio tracking application. Users can track investments across portfolios, log transactions, and monitor asset prices.

## Monorepo structure

Turborepo monorepo with `pnpm` workspaces:

- `apps/web` — Next.js 16 frontend (React 19, Tailwind CSS v4, shadcn/ui)
- `apps/server` — Fastify 5 backend with Prisma 7 + PostgreSQL
- `packages/ui` — Shared React component library (`@repo/ui`)
- `packages/eslint-config` — Shared ESLint configs
- `packages/typescript-config` — Shared `tsconfig.json` presets

## Commands

Run from the repo root with `pnpm`:

```sh
pnpm dev                          # start all apps
pnpm dev --filter=web             # start only the Next.js frontend (port 3000)
pnpm dev --filter=server          # start only the Fastify server (port 3001)
pnpm build                        # build all apps
pnpm lint                         # lint all packages
pnpm check-types                  # type-check all packages
pnpm format                       # prettier-format all TS/TSX/MD files
```

Prisma commands (run from `apps/server`):

```sh
pnpm prisma migrate dev           # apply migrations and regenerate client
pnpm prisma generate              # regenerate client without migrating
pnpm prisma studio                # open Prisma Studio
```

## Environment

`apps/server/.env` must define `DATABASE_URL` (PostgreSQL connection string). The Prisma adapter uses `@prisma/adapter-pg` (driver-adapter mode, not the default engine).

## Data model

Core models in `apps/server/prisma/schema.prisma`:

- **User** → many **Portfolio**, many **Watchlist**
- **Portfolio** → many **Holding**, many **Transaction**
- **Asset** — normalized asset registry (ticker + exchange unique); referenced by Holding, Transaction, PriceSnapshot, Watchlist
- **Holding** — current position (quantity + avg cost basis) per portfolio/asset pair
- **Transaction** — individual buy/sell/fee records
- **PriceSnapshot** — historical price records, indexed on `(assetId, recordedAt)`

All monetary quantities use `Decimal(18,8)`. UUIDs are used for all primary keys.

## Frontend conventions

- shadcn/ui components live in `apps/web/components/ui/` — add new ones via `pnpm dlx shadcn add <component>` from `apps/web/`
- Path alias `@/` maps to `apps/web/` root
- Tailwind CSS v4 configured via `postcss.config.mjs`; CSS variables defined in `app/globals.css`
- Form handling uses `react-hook-form` + `zod` (via `@hookform/resolvers`)
- Icons from `lucide-react`

## Shared UI package

`@repo/ui` exports components directly from source (`"exports": {"./*": "./src/*.tsx"}`). No build step — consumers import TS source directly. Add components with `pnpm generate:component` from `packages/ui/`.
