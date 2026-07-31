import { Prisma, type Asset, type PrismaClient } from "@prisma/client";
import type { Currency } from "@repo/api-contract";
import { fetchQuote, hasVariantSuffix, toArsTicker, type QuoteResult } from "./yahoo-finance.js";
import { getRates } from "./fx-rates.js";

/**
 * The slice of the Prisma client these helpers need. Structural rather than the
 * concrete `PrismaClient` so the same functions work inside a `$transaction`
 * (where the client is a `Prisma.TransactionClient`) and are trivial to stub.
 */
export type AssetClient = Pick<PrismaClient, "asset">;

export interface AssetSeed {
  ticker: string;
  name: string;
  assetType: string;
  exchange: string;
  currency: string;
}

/** Asset fields derived from a Yahoo quote. */
export function assetSeedFromQuote(ticker: string, quote: QuoteResult): AssetSeed {
  return {
    ticker,
    name: quote.name,
    assetType: quote.quoteType,
    exchange: quote.exchange ?? "",
    currency: quote.currency,
  };
}

/**
 * Look an asset up by ticker. Uniqueness is (ticker, exchange), so a ticker
 * alone can match several rows — order deterministically instead of letting the
 * database hand back an arbitrary one.
 */
export function findAssetByTicker(client: AssetClient, ticker: string): Promise<Asset | null> {
  return client.asset.findFirst({ where: { ticker }, orderBy: { updatedAt: "desc" } });
}

/**
 * Create an asset, recovering from a lost create race: when a concurrent
 * request inserted the same (ticker, exchange) first, return exactly that row
 * instead of failing the caller's request.
 */
export async function createAssetOrRecover(client: AssetClient, data: AssetSeed): Promise<Asset> {
  try {
    return await client.asset.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await client.asset.findUnique({
        where: { ticker_exchange: { ticker: data.ticker, exchange: data.exchange } },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

/**
 * Resolve the asset row for `ticker`, registering it on first sight. When the
 * Yahoo lookup fails the asset is still created from a minimal placeholder, so
 * an upstream outage never blocks logging a transaction.
 */
export async function findOrCreateAsset(client: AssetClient, ticker: string, fallbackCurrency: string): Promise<Asset> {
  const existing = await findAssetByTicker(client, ticker);
  if (existing) return existing;

  let seed: AssetSeed;
  try {
    seed = assetSeedFromQuote(ticker, await fetchQuote(ticker));
  } catch {
    seed = { ticker, name: ticker, assetType: "EQUITY", exchange: "", currency: fallbackCurrency };
  }

  return createAssetOrRecover(client, seed);
}

/**
 * The ticker an Asset should be stored under, collapsing a CEDEAR's three quote
 * symbols onto one identity.
 *
 * `toArsTicker` alone is not safe here: stripping a trailing D/C is ambiguous
 * for base symbols that end in those letters. `GLD.BA` is the peso CEDEAR for
 * gold, not a variant of a non-existent `GL.BA`, and blindly stripping it would
 * split the asset in two — the exact bug this whole change exists to fix.
 *
 * Resolved in order of confidence:
 *   1. An asset already registered under either form wins; the peso form first,
 *      so `SPYD.BA` joins an existing `SPY.BA`. No network, and it is the common
 *      case once a ticker has been seen.
 *   2. Otherwise the stripped form is adopted only if it really is a peso-quoted
 *      BYMA symbol upstream. `GL.BA` is not, so `GLD.BA` stays itself.
 *   3. On any upstream failure, keep the ticker as entered — never invent an
 *      identity from a lookup that did not answer.
 */
export async function resolveCanonicalTicker(client: AssetClient, ticker: string): Promise<string> {
  if (!hasVariantSuffix(ticker)) return ticker;

  const stripped = toArsTicker(ticker);

  const [existingStripped, existingRaw] = await Promise.all([findAssetByTicker(client, stripped), findAssetByTicker(client, ticker)]);
  if (existingStripped) return stripped;
  if (existingRaw) return ticker;

  try {
    const quote = await fetchQuote(stripped);
    if (quote.currency.toUpperCase() === "ARS") return stripped;
  } catch {
    // Not a real symbol (the `GL.BA` case), or upstream is down.
  }
  return ticker;
}

export interface TransactionAssetInput {
  ticker: string;
  price: number;
  currency: Currency;
  fee?: number;
  transactedAt: Date;
}

export interface ResolvedTransactionAsset {
  asset: Asset;
  price: number;
  currency: Currency;
  fee: number;
  /** ARS per USD on the trade date, snapshotted so the other two views derive. */
  mepRate: number;
  cclRate: number;
}

/**
 * Resolve the asset a transaction points at, creating the Asset row on first
 * sight, and capture the FX rates for the trade date.
 *
 * Amounts are **never converted**: `price`, `fee` and `currency` come back
 * exactly as entered. The MEP and CCL rates are recorded alongside so the other
 * two currency views can be derived at read time (see `services/currency.ts`),
 * which is what keeps the entered peso price from being lost.
 *
 * A BYMA ticker is canonicalized to its ARS form, so `SPY.BA`, `SPYD.BA` and
 * `SPYC.BA` all resolve to one Asset row — the D and C variants are quote
 * symbols for the same CEDEAR, not separate instruments.
 *
 * Callers run this *before* the holding `$transaction` because it may hit the
 * network (Yahoo, FX rates). Known tradeoff: if the later transaction fails, a
 * just-created Asset row survives as an orphan — harmless, and it will be reused
 * the next time the ticker appears.
 */
export async function resolveTransactionAsset(client: AssetClient, input: TransactionAssetInput): Promise<ResolvedTransactionAsset> {
  const { price, currency, fee, transactedAt } = input;

  const ticker = await resolveCanonicalTicker(client, input.ticker);
  const [asset, { mepRate, cclRate }] = await Promise.all([findOrCreateAsset(client, ticker, currency), getRates(transactedAt)]);

  return { asset, price, currency, fee: fee ?? 0, mepRate, cclRate };
}
