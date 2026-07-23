/**
 * lint-staged config — the fast pre-commit gate (run by `.husky/pre-commit`).
 * Runs ESLint + Prettier on staged files only; the full checks run in CI.
 *
 * It's a `.mjs` with logic (not static JSON) because ESLint needs one run per
 * app: a single run spanning multiple `apps/*` roots makes typescript-eslint
 * throw "multiple candidate TSConfigRootDirs". The `--flag v10_config_lookup_
 * from_file` makes ESLint resolve each file's config from its own directory
 * instead of the repo root where lint-staged runs.
 */

// App-root prefix of a path, e.g. `/repo/apps/web/app/page.tsx` -> `/repo/apps/web`.
// Files outside `apps/*` don't match and are skipped (only apps have ESLint configs).
// NOTE: this means `packages/*` get no pre-commit ESLint — fine today (they hold
// only config files), but extend the pattern if a source package (e.g. a real
// packages/ui) is ever added.
const APP_ROOT_PATTERN = /^.*\/apps\/[^/]+/;

// Quote each path so paths with spaces survive being spliced into a shell command.
function toQuotedShellArguments(filePaths) {
  return filePaths.map((filePath) => `"${filePath}"`).join(" ");
}

// Bucket staged files by app root so we can run ESLint once per app.
function groupStagedFilesByApp(stagedFilePaths) {
  const filePathsByAppRoot = new Map();

  for (const filePath of stagedFilePaths) {
    const appRootMatch = APP_ROOT_PATTERN.exec(filePath);
    if (!appRootMatch) continue;

    const appRootPath = appRootMatch[0];
    const filePathsForApp = filePathsByAppRoot.get(appRootPath) ?? [];
    filePathsForApp.push(filePath);
    filePathsByAppRoot.set(appRootPath, filePathsForApp);
  }

  return filePathsByAppRoot;
}

// One scoped `eslint --fix` per app, then a single Prettier pass over all files.
function buildTypeScriptCommands(stagedTypeScriptFilePaths) {
  const commands = [];

  for (const filePathsForApp of groupStagedFilesByApp(stagedTypeScriptFilePaths).values()) {
    commands.push(`eslint --fix --flag v10_config_lookup_from_file ${toQuotedShellArguments(filePathsForApp)}`);
  }

  commands.push(`prettier --write ${toQuotedShellArguments(stagedTypeScriptFilePaths)}`);

  return commands;
}

export default {
  "*.{ts,tsx}": buildTypeScriptCommands,
  "*.{md,json,css}": "prettier --write",
};
