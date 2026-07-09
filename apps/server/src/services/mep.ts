// Dólar MEP ("bolsa") rate sources. ArgentinaDatos serves the published daily
// series for historical dates; dolarapi serves the current live value.
const ARGENTINA_DATOS_BASE = "https://api.argentinadatos.com";
const DOLAR_API_BASE = "https://dolarapi.com";

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

/** Most recent published MEP rate on or before `at`, or null if unavailable. */
async function mepOnOrBefore(at: Date): Promise<number | null> {
  try {
    const res = await fetch(`${ARGENTINA_DATOS_BASE}/v1/cotizaciones/dolares/bolsa`);
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

/** Current live MEP rate from dolarapi. Throws if the request fails. */
async function currentMep(): Promise<number> {
  const res = await fetch(`${DOLAR_API_BASE}/v1/dolares/bolsa`);
  if (!res.ok) {
    throw new Error(`Failed to fetch current MEP rate: ${String(res.status)}`);
  }
  return midRate((await res.json()) as DolarQuote);
}

/**
 * Dólar MEP (ARS per USD) on or before `at`. Uses the published "bolsa" series
 * for historical dates and falls back to the current live rate when no entry
 * exists on or before `at` yet (e.g. same-day logging) or the series is
 * unreachable.
 */
async function getMepRate(at: Date): Promise<number> {
  const historical = await mepOnOrBefore(at);
  if (historical != null) return historical;
  return currentMep();
}

export default getMepRate;
