-- `exchange` was nullable, and NULLs never collide under a unique constraint,
-- so the @@unique([ticker, exchange]) index did not prevent duplicate
-- (ticker, NULL) assets from concurrent creates. Backfill NULL to '' (the
-- value the import script already used) and make the column NOT NULL so the
-- uniqueness guarantee actually holds.
UPDATE "assets" SET "exchange" = '' WHERE "exchange" IS NULL;
ALTER TABLE "assets" ALTER COLUMN "exchange" SET DEFAULT '';
ALTER TABLE "assets" ALTER COLUMN "exchange" SET NOT NULL;
