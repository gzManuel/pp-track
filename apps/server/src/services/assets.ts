import { Prisma, type Asset, type PrismaClient } from "@prisma/client";
import { fetchQuote, toUsdTicker, type QuoteResult } from "./yahoo-finance.js";
import getMepRate from "./mep.js";

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

export interface TransactionAssetInput {
  ticker: string;
  price: number;
  currency: string;
  fee?: number;
  transactedAt: Date;
}

export interface ResolvedTransactionAsset {
  asset: Asset;
  price: number;
  currency: string;
  fee: number;
}

/**
 * Resolve the asset a transaction points at, applying the CEDEAR ARS→USD
 * conversion and creating the Asset row on first sight. Shared by create/edit so
 * both normalize tickers and amounts identically.
 *
 * Callers run this *before* the holding `$transaction` because it may hit the
 * network (Yahoo, MEP rate). Known tradeoff: if the later transaction fails, a
 * just-created Asset row survives as an orphan — harmless, and it will be reused
 * the next time the ticker appears.
 */
export async function resolveTransactionAsset(client: AssetClient, input: TransactionAssetInput): Promise<ResolvedTransactionAsset> {
  let { ticker, price, currency, fee } = input;

  // CEDEARs are stored in USD. When logged in ARS against a peso ticker
  // (e.g. SPY.BA), convert price/fee to the USD `D` variant (SPYD.BA) using the
  // dólar MEP implied by the pair at the trade date.
  const usdTicker = toUsdTicker(ticker);
  if (currency.toUpperCase() === "ARS" && usdTicker !== ticker) {
    const mep = await getMepRate(input.transactedAt);
    price /= mep;
    if (fee) fee /= mep;
    ticker = usdTicker;
    currency = "USD";
  }

  const asset = await findOrCreateAsset(client, ticker, currency);

  return { asset, price, currency, fee: fee ?? 0 };
}
