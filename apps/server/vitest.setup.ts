/**
 * `src/env.ts` validates and freezes the environment at import time, so the
 * required vars must exist before any module that transitively imports it is
 * evaluated. Setting them here (rather than in each test file) is what lets
 * tests use ordinary static imports.
 *
 * `??=` so a real local/CI value always wins — nothing here should override an
 * intentionally-configured environment.
 */
process.env.INTERNAL_API_SECRET ??= "test-secret-value";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
