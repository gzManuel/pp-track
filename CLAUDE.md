# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**pp-track** is a portfolio tracking application. Users can track investments across portfolios, log transactions, and monitor asset prices.

## Monorepo structure

Turborepo monorepo with `pnpm` workspaces:

- `apps/web` — Next.js 16 frontend (React 19, Tailwind CSS v4, shadcn/ui)
- `apps/server` — Fastify 5 backend with Prisma 7 + PostgreSQL
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

## Testing conventions

All test titles (in `it(...)` and `it.each(...)` blocks) must start with **"should "** (e.g., `"should return 200 when authorized"`, `"should throw when portfolio doesn't exist"`). This convention is documented here and applied across all 22 test files in the repo.

Every `eslint-disable` or `eslint-disable-next-line` directive in a test file **must include a reason comment** (e.g., `// -- vi.fn().mock is untyped`); stale disables are flagged by `eslint-plugin-eslint-comments`. File-top blanket disables are not allowed — use scoped, line-specific disables only.

## Frontend conventions

- shadcn/ui components live in `apps/web/components/ui/` — add new ones via `pnpm dlx shadcn add <component>` from `apps/web/`
- Path alias `@/` maps to `apps/web/` root
- Tailwind CSS v4 configured via `postcss.config.mjs`; CSS variables defined in `app/globals.css`
- Form handling uses `react-hook-form` + `zod` (via `@hookform/resolvers`)
- Icons from `lucide-react`
