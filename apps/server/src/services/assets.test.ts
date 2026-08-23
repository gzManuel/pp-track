import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { createAssetOrRecover, findOrCreateAsset, resolveCanonicalTicker, type AssetClient, type AssetSeed } from "./assets.js";
import { toArsTicker, toUsdTicker } from "./yahoo-finance.js";

const fetchQuote = vi.hoisted(() => vi.fn());
vi.mock("./yahoo-finance.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./yahoo-finance.js")>()),
  fetchQuote,
}));

/** Minimal asset client backed by a list of registered tickers. */
function clientWith(tickers: string[], defaultCurrency = "ARS"): AssetClient {
  return {
    asset: {
      findFirst: vi.fn(({ where }: { where: { ticker: string } }) =>
        Promise.resolve(
          tickers.includes(where.ticker) ? { id: `id-${where.ticker}`, ticker: where.ticker, currency: defaultCurrency } : null,
        ),
      ),
    },
  } as unknown as AssetClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toArsTicker / toUsdTicker", () => {
  it.each([
    ["SPY.BA", "SPY.BA"],
    ["SPYD.BA", "SPY.BA"],
    ["SPYC.BA", "SPY.BA"],
    ["AAPL", "AAPL"],
  ])("should convert toArsTicker(%s) to %s", (input, expected) => {
    expect(toArsTicker(input)).toBe(expected);
  });

  it.each([
    ["SPY.BA", "SPYD.BA"],
    ["SPYC.BA", "SPYD.BA"],
    ["SPYD.BA", "SPYD.BA"],
    ["AAPL", "AAPL"],
  ])("should convert toUsdTicker(%s) to %s", (input, expected) => {
    expect(toUsdTicker(input)).toBe(expected);
  });
});

describe("resolveCanonicalTicker", () => {
  it("should leave a ticker with no variant suffix alone without any lookup", async () => {
    const client = clientWith([]);
    expect(await resolveCanonicalTicker(client, "AAPL")).toBe("AAPL");
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("should join a D-variant onto the peso asset already registered", async () => {
    const client = clientWith(["SPY.BA"]);
    expect(await resolveCanonicalTicker(client, "SPYD.BA")).toBe("SPY.BA");
    expect(fetchQuote).not.toHaveBeenCalled(); // resolved from the DB alone
  });

  it("should join a C-variant onto the same peso asset", async () => {
    const client = clientWith(["SPY.BA"]);
    expect(await resolveCanonicalTicker(client, "SPYC.BA")).toBe("SPY.BA");
  });

  it("should adopt the peso form on first sight when it really is a peso BYMA symbol", async () => {
    fetchQuote.mockResolvedValue({ symbol: "SPY.BA", currency: "ARS", price: 1, name: "SPDR", quoteType: "ETF", exchange: "BUE" });
    expect(await resolveCanonicalTicker(clientWith([]), "SPYD.BA")).toBe("SPY.BA");
  });

  // The GLD case: a base symbol that itself ends in D. Stripping it yields the
  // bogus GL.BA, which would split the gold CEDEAR across two asset rows.
  it("should keep GLD.BA intact when it is the registered asset", async () => {
    const client = clientWith(["GLD.BA"]);
    expect(await resolveCanonicalTicker(client, "GLD.BA")).toBe("GLD.BA");
  });

  it("should keep GLD.BA intact on first sight, since GL.BA is not a real symbol", async () => {
    fetchQuote.mockRejectedValue(new Error("Symbol not found: GL.BA"));
    expect(await resolveCanonicalTicker(clientWith([]), "GLD.BA")).toBe("GLD.BA");
  });

  it("should still merge GLDD.BA into GLD.BA", async () => {
    const client = clientWith(["GLD.BA"]);
    expect(await resolveCanonicalTicker(client, "GLDD.BA")).toBe("GLD.BA");
  });

  it("should not adopt a stripped form that is quoted in dollars", async () => {
    // A dollar quote means the stripped symbol is not the peso ticker.
    fetchQuote.mockResolvedValue({ symbol: "GL.BA", currency: "USD", price: 1, name: "?", quoteType: "EQUITY", exchange: "BUE" });
    expect(await resolveCanonicalTicker(clientWith([]), "GLD.BA")).toBe("GLD.BA");
  });

  it("should keep the entered ticker when upstream is unreachable", async () => {
    fetchQuote.mockRejectedValue(new Error("network down"));
    expect(await resolveCanonicalTicker(clientWith([]), "SPYD.BA")).toBe("SPYD.BA");
  });

  it("should not adopt an existingStripped asset if its stored currency is not ARS (poisoned asset guard)", async () => {
    // This asset exists but was cached with USD currency (e.g., from a fuzzy-matched quote).
    // It should not be adopted as canonical; the system should try the alternative.
    const client = {
      asset: {
        findFirst: vi.fn(({ where }: { where: { ticker: string } }) => {
          if (where.ticker === "SPY.BA") {
            return Promise.resolve({ id: "poisoned-spy", ticker: "SPY.BA", currency: "USD" });
          }
          return Promise.resolve(null);
        }),
      },
    } as unknown as AssetClient;

    fetchQuote.mockResolvedValue({ symbol: "SPY.BA", currency: "ARS", price: 1, name: "SPY", quoteType: "ETF", exchange: "BUE" });

    const result = await resolveCanonicalTicker(client, "SPYD.BA");

    // Should have tried the upstream quote and adopted the peso form, not the poisoned asset.
    expect(result).toBe("SPY.BA");
    expect(fetchQuote).toHaveBeenCalledWith("SPY.BA");
  });
});

describe("createAssetOrRecover", () => {
  const seed: AssetSeed = { ticker: "AAPL", name: "Apple Inc.", assetType: "EQUITY", exchange: "NMS", currency: "USD" };

  /** A P2002 is what Postgres surfaces when the (ticker, exchange) unique index rejects the insert. */
  function uniqueViolation() {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7.0.0" });
  }

  it("should return the created asset when the insert wins", async () => {
    const created = { id: "id-AAPL", ...seed };
    const create = vi.fn().mockResolvedValue(created);
    const client = { asset: { create, findUnique: vi.fn() } } as unknown as AssetClient;

    expect(await createAssetOrRecover(client, seed)).toBe(created);
    expect(create).toHaveBeenCalledWith({ data: seed });
  });

  it("should return the row the winner inserted when the create loses the race", async () => {
    const winner = { id: "id-winner", ...seed };
    const findUnique = vi.fn().mockResolvedValue(winner);
    const client = {
      asset: { create: vi.fn().mockRejectedValue(uniqueViolation()), findUnique },
    } as unknown as AssetClient;

    expect(await createAssetOrRecover(client, seed)).toBe(winner);
    expect(findUnique).toHaveBeenCalledWith({ where: { ticker_exchange: { ticker: "AAPL", exchange: "NMS" } } });
  });

  it("should rethrow the P2002 when the conflicting row cannot be found", async () => {
    // The unique index rejected the insert but the row is gone by the time we
    // look — recovering is impossible, so the caller must see the real error.
    const client = {
      asset: { create: vi.fn().mockRejectedValue(uniqueViolation()), findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as AssetClient;

    await expect(createAssetOrRecover(client, seed)).rejects.toThrow("Unique constraint failed");
  });

  it("should rethrow a Prisma error that is not a unique violation without looking for a row", async () => {
    const findUnique = vi.fn();
    const other = new Prisma.PrismaClientKnownRequestError("Timed out", { code: "P2024", clientVersion: "7.0.0" });
    const client = { asset: { create: vi.fn().mockRejectedValue(other), findUnique } } as unknown as AssetClient;

    await expect(createAssetOrRecover(client, seed)).rejects.toThrow("Timed out");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("should rethrow a non-Prisma error untouched", async () => {
    const client = {
      asset: { create: vi.fn().mockRejectedValue(new Error("connection reset")), findUnique: vi.fn() },
    } as unknown as AssetClient;

    await expect(createAssetOrRecover(client, seed)).rejects.toThrow("connection reset");
  });
});

describe("findOrCreateAsset", () => {
  /** Asset client where the ticker is unregistered, so the create path runs. */
  function emptyClient() {
    return {
      asset: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn((args: { data: AssetSeed }) => Promise.resolve({ id: "new", ...args.data })),
        findUnique: vi.fn(),
      },
    } as unknown as AssetClient;
  }

  it("should return the registered asset without hitting the network", async () => {
    const existing = { id: "id-AAPL", ticker: "AAPL", currency: "USD" };
    const client = { asset: { findFirst: vi.fn().mockResolvedValue(existing), create: vi.fn() } } as unknown as AssetClient;

    expect(await findOrCreateAsset(client, "AAPL", "USD")).toBe(existing);
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("should seed a new asset from the upstream quote on first sight", async () => {
    fetchQuote.mockResolvedValue({ symbol: "AAPL", price: 100, currency: "USD", name: "Apple Inc.", quoteType: "EQUITY", exchange: "NMS" });
    const client = emptyClient();

    expect(await findOrCreateAsset(client, "AAPL", "ARS")).toMatchObject({
      ticker: "AAPL",
      name: "Apple Inc.",
      assetType: "EQUITY",
      exchange: "NMS",
      currency: "USD",
    });
  });

  // An upstream outage must not block logging a transaction.
  it("should fall back to a placeholder seed in the caller's currency when the quote fails", async () => {
    fetchQuote.mockRejectedValue(new Error("upstream down"));
    const client = emptyClient();

    expect(await findOrCreateAsset(client, "AAPL", "ARS")).toMatchObject({
      ticker: "AAPL",
      name: "AAPL",
      assetType: "EQUITY",
      exchange: "",
      currency: "ARS",
    });
  });

  it("should default the exchange to an empty string when the quote omits it", async () => {
    fetchQuote.mockResolvedValue({
      symbol: "BTC-USD",
      price: 1,
      currency: "USD",
      name: "Bitcoin",
      quoteType: "CRYPTOCURRENCY",
      exchange: null,
    });
    const client = emptyClient();

    expect(await findOrCreateAsset(client, "BTC-USD", "USD")).toMatchObject({ exchange: "" });
  });
});
