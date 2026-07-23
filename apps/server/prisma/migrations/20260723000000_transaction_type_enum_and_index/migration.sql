-- `type` was a bare String: any write path bypassing the route-level zod
-- normalization could insert "buy", which the replay filter (type IN
-- ('BUY','SELL')) would silently drop — corrupting the holding without error.
-- Normalize existing data, then enforce the value set at the DB level.
UPDATE "transactions" SET "type" = UPPER("type");

CREATE TYPE "TransactionType" AS ENUM ('BUY', 'SELL', 'DIVIDEND', 'FEE');

ALTER TABLE "transactions"
  ALTER COLUMN "type" TYPE "TransactionType" USING ("type"::"TransactionType");

-- Postgres does not index FK columns automatically; the holding replay query
-- (portfolio_id, asset_id ordered by transacted_at) runs inside a row-locked
-- transaction on every create/edit/delete and was a sequential scan.
CREATE INDEX "transactions_portfolio_id_asset_id_transacted_at_idx"
  ON "transactions"("portfolio_id", "asset_id", "transacted_at");
