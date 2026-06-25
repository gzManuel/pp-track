# Contributing to pp-track

Thanks for your interest in contributing! Contributions of all kinds are
welcome — bug reports, fixes, features, docs, and tests.

## License & CLA

pp-track is **source-available** under the [Business Source License 1.1](./LICENSE)
(it converts to Apache License 2.0 on 2030-06-15). You're free to read, fork, and
modify the code, and to self-host it for personal, non-commercial use.

Because the Project is not standard open source, every contributor must agree to
the [Contributor License Agreement (CLA)](./CLA.md) before their changes can be
merged. This lets the maintainer keep the Project under a single, consistent
license. **You retain copyright to your contributions** — the CLA only grants the
maintainer a license to use and relicense them.

The simplest way to agree is to **sign off your commits**:

```sh
git commit -s -m "fix: correct avg cost basis rounding"
```

This adds a `Signed-off-by: Your Name <you@example.com>` line, certifying you
agree to the CLA for that contribution. See [CLA.md](./CLA.md) for the full text
and alternatives.

## Getting started

This is a Turborepo monorepo using `pnpm` workspaces. See [CLAUDE.md](./CLAUDE.md)
for the full project layout.

```sh
pnpm install                      # install all workspace dependencies
pnpm dev                          # start all apps
pnpm dev --filter=web             # frontend only (port 3000)
pnpm dev --filter=server          # backend only (port 3001)
```

The server needs `apps/server/.env` with a `DATABASE_URL` (PostgreSQL). Apply
migrations from `apps/server`:

```sh
pnpm migrate
```

## Before you open a pull request

Please make sure the following pass from the repo root:

```sh
pnpm lint                         # lint all packages
pnpm check-types                  # type-check all packages
pnpm format                       # prettier formatting
pnpm build                        # production build
```

## Pull request guidelines

- For new features or larger changes, **open an issue first** to discuss the
  approach before investing time.
- For small fixes (typos, docs, minor bugs), a PR alone is fine — link a related
  issue if one exists.
- Branch off `main` and keep PRs focused on a single concern.
- Use clear, conventional commit messages (e.g. `feat:`, `fix:`, `chore:`),
  matching the existing history.
- Make sure each commit is **signed off** (`-s`).
- Describe what changed and why.

## Reporting bugs & requesting features

Open a GitHub issue with as much detail as you can: steps to reproduce, expected
vs. actual behavior, and your environment. For features, describe the use case.

## Questions

For usage questions or help, please use
[GitHub Discussions](https://github.com/gzManuel/pp-track/discussions) (Q&A
category) rather than opening an issue. For licensing, security, or anything not
covered here, reach the maintainer at **garistozm@outlook.com**.
