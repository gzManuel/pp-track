# web

The **pp-track** frontend — a [Next.js 16](https://nextjs.org/) app (App Router) using React 19, Tailwind CSS v4, and shadcn/ui. It renders portfolios, holdings, transactions, and price charts, and talks to the Fastify server over HTTP.

## Stack

- **Next.js 16** (App Router) + **React 19**
- **Tailwind CSS v4** (configured via `postcss.config.mjs`; CSS variables in `app/globals.css`)
- **shadcn/ui** components in `components/ui/` (Radix primitives)
- **[NextAuth](https://next-auth.js.org/)** for Google / Facebook OAuth
- **react-hook-form** + **zod** for forms
- **Recharts** for charts, **lucide-react** for icons

## Getting started

From the repo root, `pnpm install`. Then from this directory:

```sh
cp .env.example .env.local        # then fill in the values
pnpm dev                          # start on http://localhost:3000
```

Or run it alongside the rest of the stack with `pnpm dev --filter=web` from the repo root. The web app expects the [server](../server) to be running (default `http://localhost:3001`).

## Scripts

```sh
pnpm dev            # next dev on port 3000
pnpm build          # next build
pnpm start          # next start (serve the production build)
pnpm lint           # eslint (max-warnings 0)
pnpm check-types    # next typegen + tsc --noEmit
```

## Environment

Copy `.env.example` to `.env.local` and set:

| Variable                                        | Description                                                   |
| ----------------------------------------------- | ------------------------------------------------------------- |
| `SERVER_API_URL`                                | Base URL of the Fastify server (e.g. `http://localhost:3001`) |
| `INTERNAL_API_SECRET`                           | Shared secret; must match the server's value                  |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET`              | NextAuth base URL and session secret                          |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`     | Google OAuth credentials                                      |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | Facebook OAuth credentials                                    |

## Project layout

```
app/                  # App Router routes, layouts, pages
components/           # feature components
  ui/                 # shadcn/ui primitives (add via `pnpm dlx shadcn add <component>`)
lib/                  # helpers and shared client utilities
types/                # shared TypeScript types
middleware.ts         # NextAuth route protection
```

The `@/` path alias maps to the app root.
