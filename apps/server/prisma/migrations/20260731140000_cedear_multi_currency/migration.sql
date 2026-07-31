-- Unify CEDEAR assets and stop discarding the currency a trade was entered in.
--
-- Before this migration a peso CEDEAR purchase was rewritten on write: the price
-- was divided by the MEP rate, the currency forced to 'USD', and the ticker moved
-- to its `D` variant (SPY.BA -> SPYD.BA). That lost the peso price and split one
-- instrument across two asset rows.
--
-- This migration only makes room for the new model. Restoring the peso prices and
-- populating the rate snapshots needs the FX rate API, so it runs afterwards in
-- scripts/backfill-currency.ts.

-- 1. Rate snapshot per transaction. Nullable here because the backfill has not
--    run yet; every new write populates both.
ALTER TABLE "transactions"
  ADD COLUMN "mep_rate" DECIMAL(18, 8),
  ADD COLUMN "ccl_rate" DECIMAL(18, 8);

-- 2. Cost basis in all three currencies. Defaults are placeholders that the
--    backfill's replay overwrites; the MEP column keeps its existing values.
ALTER TABLE "holdings"
  ADD COLUMN "avg_cost_basis_ars" DECIMAL(18, 8) NOT NULL DEFAULT 0,
  ADD COLUMN "avg_cost_basis_ccl" DECIMAL(18, 8) NOT NULL DEFAULT 0;

-- 3. 'USD' never said *which* dollar. Every existing USD row was valued at the
--    MEP rate by the old code, so MEP is the faithful reading. Offshore holdings
--    are really CCL and must be reclassified by hand — the backfill lists them.
CREATE TYPE "Currency" AS ENUM ('ARS', 'MEP', 'CCL');

UPDATE "transactions" SET "currency" = 'MEP' WHERE UPPER("currency") IN ('USD', 'MEP');
UPDATE "transactions" SET "currency" = 'ARS' WHERE UPPER("currency") = 'ARS';
UPDATE "transactions" SET "currency" = 'CCL' WHERE UPPER("currency") = 'CCL';

-- Anything else is unrecognized; fail loudly rather than silently coercing it.
DO $$
DECLARE bad_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_count FROM "transactions" WHERE "currency" NOT IN ('ARS', 'MEP', 'CCL');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Cannot migrate: % transaction(s) have an unrecognized currency', bad_count;
  END IF;
END $$;

ALTER TABLE "transactions"
  ALTER COLUMN "currency" DROP DEFAULT,
  ALTER COLUMN "currency" TYPE "Currency" USING ("currency"::"Currency"),
  ALTER COLUMN "currency" SET DEFAULT 'MEP';

-- Portfolio.currency is a display label rather than a stored amount, so it stays
-- a plain string — but the same 'USD' ambiguity applies to what it shows.
UPDATE "portfolios" SET "currency" = 'MEP' WHERE UPPER("currency") = 'USD';

-- 4. Merge each `*D.BA` / `*C.BA` asset into its peso counterpart, creating the
--    peso row when only the variant exists. The D and C symbols are quote
--    symbols for one CEDEAR, not separate instruments.
-- Stripping a trailing D/C is ambiguous: `GLD.BA` is the peso CEDEAR for gold,
-- not a variant of a non-existent `GL.BA` (its real variant is `GLDD.BA`).
-- The quote currency disambiguates — a D/C variant is dollar-quoted, the peso
-- ticker is not — so only dollar-quoted rows are treated as variants.
CREATE TEMP TABLE cedear_merge AS
SELECT
  variant.id                AS variant_id,
  regexp_replace(variant.ticker, '[DC]\.BA$', '.BA') AS ars_ticker,
  variant.exchange          AS exchange
FROM "assets" variant
WHERE variant.ticker ~ '[DC]\.BA$'
  AND UPPER(variant.currency) <> 'ARS';

-- Create the peso asset wherever it does not exist yet, carrying over the
-- variant's metadata (name/type/exchange) and marking it ARS-quoted.
INSERT INTO "assets" ("id", "ticker", "name", "asset_type", "exchange", "currency", "updated_at")
SELECT DISTINCT ON (m.ars_ticker, m.exchange)
  gen_random_uuid(), m.ars_ticker, v.name, v.asset_type, m.exchange, 'ARS', NOW()
FROM cedear_merge m
JOIN "assets" v ON v.id = m.variant_id
WHERE NOT EXISTS (
  SELECT 1 FROM "assets" a WHERE a.ticker = m.ars_ticker AND a.exchange = m.exchange
);

-- Map every variant to the peso asset that now certainly exists.
CREATE TEMP TABLE cedear_remap AS
SELECT m.variant_id, a.id AS ars_id
FROM cedear_merge m
JOIN "assets" a ON a.ticker = m.ars_ticker AND a.exchange = m.exchange;

-- Record what each affected transaction looked like *before* the remap. The
-- variant asset rows are deleted below, so without this there is no way to tell
-- afterwards which trades were the ones whose peso price got converted away —
-- which is exactly what the backfill needs to know to restore them. Kept as a
-- real table rather than a temp one: it is the audit trail of a destructive
-- migration, and it is what you would read to check the repair by hand.
CREATE TABLE "cedear_migration_log" (
  "transaction_id" UUID PRIMARY KEY,
  "old_ticker"     TEXT NOT NULL,
  "new_ticker"     TEXT NOT NULL,
  "old_currency"   TEXT NOT NULL,
  "old_price"      DECIMAL(18, 8) NOT NULL,
  "old_fee"        DECIMAL(18, 8) NOT NULL,
  "restored"       BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO "cedear_migration_log"
  ("transaction_id", "old_ticker", "new_ticker", "old_currency", "old_price", "old_fee")
SELECT t.id, v.ticker, a.ticker, t."currency"::TEXT, t."price", t."fee"
FROM "transactions" t
JOIN cedear_remap r ON t."asset_id" = r.variant_id
JOIN "assets" v ON v.id = r.variant_id
JOIN "assets" a ON a.id = r.ars_id;

UPDATE "transactions" t SET "asset_id" = r.ars_id
FROM cedear_remap r WHERE t."asset_id" = r.variant_id;

UPDATE "price_snapshots" p SET "asset_id" = r.ars_id
FROM cedear_remap r WHERE p."asset_id" = r.variant_id;

UPDATE "watchlist" w SET "asset_id" = r.ars_id
FROM cedear_remap r
WHERE w."asset_id" = r.variant_id
  -- Skip rows that would collide with an existing (user, asset) pair.
  AND NOT EXISTS (
    SELECT 1 FROM "watchlist" w2 WHERE w2."user_id" = w."user_id" AND w2."asset_id" = r.ars_id
  );
DELETE FROM "watchlist" w USING cedear_remap r WHERE w."asset_id" = r.variant_id;

-- Holdings can collide: a portfolio may hold both SPY.BA and SPYD.BA. Fold the
-- variant's quantity into the peso row at a blended average, then drop it.
UPDATE "holdings" target SET
  "avg_cost_basis" = (
    (target."quantity" * target."avg_cost_basis" + source."quantity" * source."avg_cost_basis")
    / NULLIF(target."quantity" + source."quantity", 0)
  ),
  "quantity" = target."quantity" + source."quantity",
  "updated_at" = NOW()
FROM "holdings" source
JOIN cedear_remap r ON source."asset_id" = r.variant_id
WHERE target."portfolio_id" = source."portfolio_id"
  AND target."asset_id" = r.ars_id;

DELETE FROM "holdings" h
USING cedear_remap r, "holdings" target
WHERE h."asset_id" = r.variant_id
  AND target."portfolio_id" = h."portfolio_id"
  AND target."asset_id" = r.ars_id;

-- Whatever variant holdings remain had no peso counterpart: just repoint them.
UPDATE "holdings" h SET "asset_id" = r.ars_id
FROM cedear_remap r WHERE h."asset_id" = r.variant_id;

DELETE FROM "assets" a USING cedear_remap r WHERE a.id = r.variant_id;

DROP TABLE cedear_remap;
DROP TABLE cedear_merge;
