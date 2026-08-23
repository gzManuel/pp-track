<!--
Thanks for contributing to pp-track! A few notes before you submit:

- For new features or larger changes, please open an issue first to agree on the
  approach. Small fixes (typos, docs, minor bugs) can go straight to a PR.
- Keep each PR focused on a single concern — it makes review much faster.
- Every commit must be signed off (`git commit -s`) to agree to the CLA.

See CONTRIBUTING.md for the full guidelines.
-->

## What

<!-- One or two sentences: what does this PR do? -->

## Why

<!-- The problem this solves, or the behavior it fixes. Link the issue if there is one. -->

Closes #

## Changes

<!-- Bullet the specific changes. Group related ones. Call out anything deleted or renamed. -->

-

## Area

<!-- Delete the lines that don't apply. -->

- web (Next.js frontend)
- server (Fastify API)
- data model / Prisma schema
- prices / assets
- tooling / CI / build
- docs

## Checklist

Run from the repo root — these are what CI gates on:

- [ ] `pnpm lint`
- [ ] `pnpm check-types`
- [ ] `pnpm test`
- [ ] `pnpm format:check`
- [ ] `pnpm build`

And:

- [ ] Commits are signed off (`git commit -s`) — required by the [CLA](../CLA.md)
- [ ] Commit messages follow the conventional style (`feat:`, `fix:`, `chore:`, …)
- [ ] New test titles start with `"should "` (see CLAUDE.md)
- [ ] Any `eslint-disable` in a test file has a reason comment

## Database changes

<!-- Delete this section if the Prisma schema is untouched. -->

- [ ] A migration is included (`pnpm migrate`), not just a `schema.prisma` edit
- [ ] `pnpm prisma migrate diff` reports no drift

## Screenshots

<!-- For UI changes, before/after helps a lot. Delete if not applicable. -->

## Notes for the reviewer

<!--
Anything that would otherwise be a surprise: known failing checks and why,
deliberately deferred work, decisions you'd like a second opinion on.
-->
