import { Prisma, type PrismaClient } from "@prisma/client";
import type { Currency } from "@repo/api-contract";
import { fetchQuote, toArsTicker, toUsdTicker } from "./yahoo-finance.js";
import { assetSeedFromQuote, createAssetOrRecover } from "./assets.js";

const CACHE_TTL_MS = 15 * 60 * 1000;

// How long stale snapshots are kept before being pruned on the next write.
const SNAPSHOT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface PriceLookup {
  ticker: string;
  price: string;
  currency: string;
  recordedAt: Date;
  cached: boolean;
}

/** ARS per USD, fetched once per request and shared across the batch. */
export interface Rates {
  mepRate: number;
  cclRate: number;
}

/**
 * The symbol to request a quote for, given the currency being displayed.
 *
 * CEDEARs quote under three BYMA symbols. The peso (`SPY.BA`) and MEP-dollar
 * (`SPYD.BA`) ones are quoted directly by the market, so we ask for those rather
 * than deriving them. There is no reliable `C` quote, so the CCL view is derived
 * from the peso price — which is why CCL asks for the ARS symbol here.
 */
export function quoteSymbolFor(ticker: string, currency: Currency): string {
  return currency === "MEP" ? toUsdTicker(ticker) : toArsTicker(ticker);
}

/**
 * Bring a quote into the requested currency.
 *
 * The rule is only about crossing the peso/dollar boundary: a quote already on
 * the requested side passes through untouched, and one on the wrong side is
 * converted at the rate that names the target (MEP or CCL). A dollar price is
 * the same number whether those dollars are called MEP or CCL — the two differ
 * only in what they are worth in pesos.
 *
 * Pure, so the currency matrix is testable without a database or network.
 */
export function convertQuote(
  price: Prisma.Decimal,
  quotedCurrency: string,
  target: Currency,
  rates: Rates,
): { price: Prisma.Decimal; currency: string } {
  const quotedInArs = quotedCurrency.toUpperCase() === "ARS";

  if (target === "ARS") {
    // A dollar-quoted asset (crypto, a US listing) valued in pesos at MEP —
    // the rate you would realize selling locally.
    return quotedInArs ? { price, currency: "ARS" } : { price: price.times(rates.mepRate), currency: "ARS" };
  }

  if (!quotedInArs) return { price, currency: "USD" };

  const rate = target === "CCL" ? rates.cclRate : rates.mepRate;
  return { price: price.div(rate), currency: "USD" };
}

/**
 * Latest price for one ticker in the requested currency, served from the
 * price-snapshot cache when it is fresh and fetched upstream otherwise.
 *
 * Snapshots are cached under the symbol actually quoted, but the result is
 * always keyed by the ticker as requested so a batch caller can match results
 * back to its inputs.
 */
export async function getPrice(prisma: PrismaClient, requestedTicker: string, currency: Currency, rates: Rates): Promise<PriceLookup> {
  const fetchSymbol = quoteSymbolFor(requestedTicker, currency);
  const cutoff = new Date(Date.now() - CACHE_TTL_MS);

  const asset = await prisma.asset.findFirst({
    where: { ticker: fetchSymbol },
    // Uniqueness is (ticker, exchange) — order deterministically in case the
    // same ticker exists on several exchanges.
    orderBy: { updatedAt: "desc" },
    include: {
      priceSnapshots: {
        where: { recordedAt: { gte: cutoff } },
        orderBy: { recordedAt: "desc" },
        take: 1,
      },
    },
  });

  const cached = asset?.priceSnapshots[0];
  const raw = cached
    ? { price: cached.price, currency: cached.currency, recordedAt: cached.recordedAt, cached: true }
    : await fetchAndCache(prisma, fetchSymbol, asset);

  const converted = convertQuote(raw.price, raw.currency, currency, rates);

  return {
    ticker: requestedTicker,
    price: converted.price.toString(),
    currency: converted.currency,
    recordedAt: raw.recordedAt,
    cached: raw.cached,
  };
}

/** Fetch a fresh quote, register the asset if new, and store the snapshot. */
async function fetchAndCache(prisma: PrismaClient, fetchSymbol: string, asset: { id: string; name: string } | null) {
  const quote = await fetchQuote(fetchSymbol);

  let assetId: string;
  if (!asset) {
    const created = await createAssetOrRecover(prisma, assetSeedFromQuote(fetchSymbol, quote));
    assetId = created.id;
  } else {
    if (asset.name !== quote.name) {
      await prisma.asset.update({ where: { id: asset.id }, data: { name: quote.name } });
    }
    assetId = asset.id;
  }

  const snapshot = await prisma.priceSnapshot.create({
    data: { assetId, price: quote.price, currency: quote.currency, recordedAt: new Date() },
  });

  // Snapshots are a price cache, not history — prune this asset's stale rows in
  // the same write path so the table can't grow without bound.
  await prisma.priceSnapshot.deleteMany({
    where: { assetId, recordedAt: { lt: new Date(Date.now() - SNAPSHOT_RETENTION_MS) } },
  });

  return { price: snapshot.price, currency: snapshot.currency, recordedAt: snapshot.recordedAt, cached: false };
}
