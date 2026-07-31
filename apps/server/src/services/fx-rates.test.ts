import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

/**
 * The rate module caches per (rate, calendar day) at module scope, so each test
 * imports a fresh copy via `vi.resetModules()` rather than sharing state.
 */
async function freshModule() {
  vi.resetModules();
  return import("./fx-rates.js");
}

const HISTORICAL = [
  { moneda: "USD", casa: "bolsa", fecha: "2026-06-01", compra: 1400, venta: 1410 },
  { moneda: "USD", casa: "bolsa", fecha: "2026-06-02", compra: 1444.8, venta: 1454 },
  { moneda: "USD", casa: "bolsa", fecha: "2026-06-05", compra: 1500, venta: 1510 },
];

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

// Typed so an `async` implementation isn't inferred as returning void.
type FetchLike = (url: string) => Promise<Response>;
let fetchMock: Mock<FetchLike>;

beforeEach(() => {
  fetchMock = vi.fn<FetchLike>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getRate", () => {
  it("requests the path for the rate it was asked for", async () => {
    fetchMock.mockResolvedValue(jsonResponse(HISTORICAL));
    const { getRate } = await freshModule();

    await getRate("contadoconliqui", new Date("2026-06-02T12:00:00Z"));

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/cotizaciones/dolares/contadoconliqui"), expect.anything());
  });

  it("takes the latest entry on or before the date, skipping non-trading days", async () => {
    fetchMock.mockResolvedValue(jsonResponse(HISTORICAL));
    const { getMepRate } = await freshModule();

    // 2026-06-04 has no entry; the 06-02 close is the one in effect.
    const rate = await getMepRate(new Date("2026-06-04T12:00:00Z"));

    expect(rate).toBe((1444.8 + 1454) / 2);
  });

  it("never returns a rate from after the requested date", async () => {
    fetchMock.mockResolvedValue(jsonResponse(HISTORICAL));
    const { getMepRate } = await freshModule();

    const rate = await getMepRate(new Date("2026-06-01T12:00:00Z"));

    expect(rate).toBe(1405); // the 06-01 close, not 06-02 or 06-05
  });

  it("falls back to the live rate when the series has nothing on or before the date", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(HISTORICAL))
      .mockResolvedValueOnce(jsonResponse({ moneda: "USD", casa: "bolsa", compra: 1600, venta: 1610 }));
    const { getMepRate } = await freshModule();

    // Predates every published entry, so only the live endpoint can answer.
    const rate = await getMepRate(new Date("2020-01-01T12:00:00Z"));

    expect(rate).toBe(1605);
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("dolarapi.com/v1/dolares/bolsa"), expect.anything());
  });

  it("falls back to the live rate when the historical series is unreachable", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(jsonResponse({ moneda: "USD", casa: "bolsa", compra: 1600, venta: 1610 }));
    const { getMepRate } = await freshModule();

    expect(await getMepRate(new Date("2026-06-02T12:00:00Z"))).toBe(1605);
  });

  it("caches per calendar day", async () => {
    fetchMock.mockResolvedValue(jsonResponse(HISTORICAL));
    const { getMepRate } = await freshModule();

    await getMepRate(new Date("2026-06-02T09:00:00Z"));
    await getMepRate(new Date("2026-06-02T23:00:00Z")); // same UTC day

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keys the cache by rate, so MEP and CCL cannot collide", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      jsonResponse(
        url.includes("contadoconliqui")
          ? [{ moneda: "USD", casa: "contadoconliqui", fecha: "2026-06-02", compra: 1560, venta: 1570 }]
          : HISTORICAL,
      ),
    );
    const { getCclRate, getMepRate } = await freshModule();
    const at = new Date("2026-06-02T12:00:00Z");

    expect(await getMepRate(at)).toBe(1449.4);
    expect(await getCclRate(at)).toBe(1565);
  });

  it("dedupes concurrent lookups of the same rate and day into one fetch", async () => {
    fetchMock.mockResolvedValue(jsonResponse(HISTORICAL));
    const { getMepRate } = await freshModule();
    const at = new Date("2026-06-02T12:00:00Z");

    const [a, b, c] = await Promise.all([getMepRate(at), getMepRate(at), getMepRate(at)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual([1449.4, 1449.4, 1449.4]);
  });

  it("throws when both sources fail rather than inventing a rate", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([], false)).mockResolvedValueOnce(jsonResponse(null, false));
    const { getMepRate } = await freshModule();

    await expect(getMepRate(new Date("2026-06-02T12:00:00Z"))).rejects.toThrow(/Failed to fetch current bolsa rate/);
  });
});

describe("getRates", () => {
  it("returns both rates for one date", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      jsonResponse(
        url.includes("contadoconliqui")
          ? [{ moneda: "USD", casa: "contadoconliqui", fecha: "2026-06-02", compra: 1560, venta: 1570 }]
          : HISTORICAL,
      ),
    );
    const { getRates } = await freshModule();

    expect(await getRates(new Date("2026-06-02T12:00:00Z"))).toEqual({ mepRate: 1449.4, cclRate: 1565 });
  });
});
