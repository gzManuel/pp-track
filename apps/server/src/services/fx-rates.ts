// Argentine dollar rate sources. ArgentinaDatos serves the published daily
// series for historical dates; dolarapi serves the current live value. Both
// expose the same shape under a per-rate path, so one implementation covers
// every rate we track.
const ARGENTINA_DATOS_BASE = "https://api.argentinadatos.com";
const DOLAR_API_BASE = "https://dolarapi.com";

// A hung upstream must never hang a request handler — especially here, where
// the in-flight dedupe below would pin every conversion on one stuck fetch.
const FETCH_TIMEOUT_MS = 5000;

/**
 * The upstream's name for a rate. `bolsa` is the dólar MEP (local settlement),
 * `contadoconliqui` the dólar CCL (cable / offshore settlement).
 */
export type Casa = "bolsa" | "contadoconliqui";

interface DolarQuote {
  moneda: string;
  casa: string;
  fecha?: string; // YYYY-MM-DD — present on the historical series only
  compra: number;
  venta: number;
}

// Neutral mid-market rate (ARS per USD). Switch to `q.venta` if you'd rather
// price at the cost of buying dollars, or `q.compra` for selling them.
function midRate(q: DolarQuote): number {
  return (q.compra + q.venta) / 2;
}

// `at` is anchored at a fixed UTC time, so its UTC date is the intended
// calendar day. Format it the way ArgentinaDatos keys its `fecha` (YYYY-MM-DD)
// so the zero-padded strings compare lexicographically as dates.
function toUtcDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${String(y)}-${m}-${day}`;
}

/** Most recent published rate on or before `at`, or null if unavailable. */
async function rateOnOrBefore(casa: Casa, at: Date): Promise<number | null> {
  try {
    const res = await fetch(`${ARGENTINA_DATOS_BASE}/v1/cotizaciones/dolares/${casa}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const series = (await res.json()) as DolarQuote[];

    const cutoff = toUtcDateStr(at);
    // Keep entries dated on or before `at`, then take the latest — mirrors the
    // "on or before" rule and naturally skips weekends/holidays with no entry.
    const eligible = series.filter((q): q is DolarQuote & { fecha: string } => q.fecha != null && q.fecha <= cutoff);
    if (eligible.length === 0) return null;

    const latest = eligible.reduce((a, b) => (a.fecha >= b.fecha ? a : b));
    return midRate(latest);
  } catch {
    return null;
  }
}

/** Current live rate from dolarapi. Throws if the request fails. */
async function currentRate(casa: Casa): Promise<number> {
  const res = await fetch(`${DOLAR_API_BASE}/v1/dolares/${casa}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch current ${casa} rate: ${String(res.status)}`);
  }
  return midRate((await res.json()) as DolarQuote);
}

// Every uncached lookup downloads the entire historical series, so a short
// in-memory TTL cache keyed by rate + calendar day (mirroring the 15-minute
// price cache) plus in-flight dedupe keeps a burst of conversions from firing
// the same fetch N times in parallel.
const RATE_TTL_MS = 15 * 60 * 1000;
const rateCache = new Map<string, { rate: number; expiresAt: number }>();
const inFlight = new Map<string, Promise<number>>();

/**
 * Published rate (ARS per USD) on or before `at`. Uses the historical series for
 * past dates and falls back to the current live rate when no entry exists on or
 * before `at` yet (e.g. same-day logging) or the series is unreachable.
 */
export async function getRate(casa: Casa, at: Date): Promise<number> {
  const key = `${casa}:${toUtcDateStr(at)}`;

  const cached = rateCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const rate = (await rateOnOrBefore(casa, at)) ?? (await currentRate(casa));
    // Evict aged-out entries before inserting: without this a long-running
    // process accumulates one dead entry per (rate, calendar day) ever looked
    // up, and a backfill walking years of history is exactly that workload.
    const now = Date.now();
    for (const [k, v] of rateCache) {
      if (v.expiresAt <= now) rateCache.delete(k);
    }
    rateCache.set(key, { rate, expiresAt: now + RATE_TTL_MS });
    return rate;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

/** Dólar MEP (ARS per USD) on or before `at`. */
export const getMepRate = (at: Date): Promise<number> => getRate("bolsa", at);

/** Dólar CCL (ARS per USD) on or before `at`. */
export const getCclRate = (at: Date): Promise<number> => getRate("contadoconliqui", at);

/**
 * Both rates for a trade date. Every transaction snapshots both, because any
 * entry currency needs both of them to be expressed in the other two.
 */
export async function getRates(at: Date): Promise<{ mepRate: number; cclRate: number }> {
  const [mepRate, cclRate] = await Promise.all([getMepRate(at), getCclRate(at)]);
  return { mepRate, cclRate };
}
