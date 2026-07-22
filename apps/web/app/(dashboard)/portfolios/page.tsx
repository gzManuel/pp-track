import Link from "next/link";
import { getUserId } from "@/lib/auth";
import { serverFetch } from "@/lib/server-api";
import CreatePortfolioDialog from "../_components/CreatePortfolioDialog";

interface Portfolio {
  id: string;
  name: string;
  isDefault: boolean;
  currency: string;
}

interface RawHolding {
  id: string;
  quantity: string;
  avgCostBasis: string;
  asset: { ticker: string; name: string; currency: string; assetType: string };
}

interface PortfolioSummary {
  totalInvested: number;
  totalMarketValue: number;
  gain: number;
  gainPct: number | null;
}

async function getSummary(userId: string, portfolioId: string): Promise<PortfolioSummary> {
  const holdingsRes = await serverFetch(`/api/portfolios/${portfolioId}/holdings`, { userId });
  const rawHoldings = (await holdingsRes.json()) as RawHolding[];

  const tickers = rawHoldings.map((h) => h.asset.ticker).join(",");
  const priceMap: Record<string, number> = {};
  if (tickers) {
    const pricesRes = await serverFetch(`/api/prices?tickers=${encodeURIComponent(tickers)}`);
    const prices = (await pricesRes.json()) as { ticker: string; price?: string }[];
    prices
      .filter((p) => p.price)
      .forEach((p) => {
        priceMap[p.ticker] = Number(p.price);
      });
  }

  let totalInvested = 0;
  let totalMarketValue = 0;
  rawHoldings.forEach((h) => {
    const shares = Number(h.quantity);
    const avgCost = Number(h.avgCostBasis);
    const costBasis = shares * avgCost;
    const currentPrice = priceMap[h.asset.ticker] ?? null;
    totalInvested += costBasis;
    totalMarketValue += currentPrice !== null ? shares * currentPrice : costBasis;
  });

  const gain = totalMarketValue - totalInvested;
  const gainPct = totalInvested > 0 ? (gain / totalInvested) * 100 : null;

  return { totalInvested, totalMarketValue, gain, gainPct };
}

function fmt(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function PortfoliosPage() {
  const userId = await getUserId();

  const res = await serverFetch("/api/portfolios", { userId });
  const portfolios = (await res.json()) as Portfolio[];

  const cards = await Promise.all(portfolios.map(async (p) => ({ portfolio: p, summary: await getSummary(userId, p.id) })));

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Portfolios</h1>
        <CreatePortfolioDialog />
      </div>

      {portfolios.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted-foreground">No portfolios yet. Create one to get started.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ portfolio: p, summary }) => {
            const positive = summary.gain >= 0;
            return (
              <Link
                key={p.id}
                href={`/dashboard?portfolio=${p.id}`}
                className="rounded-lg border p-5 flex flex-col gap-3 transition-colors hover:bg-muted/50 hover:border-foreground/20"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{p.name}</span>
                    {p.isDefault && <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">Default</span>}
                  </div>
                  <span className="text-sm text-muted-foreground">{p.currency}</span>
                </div>

                <dl className="flex flex-col gap-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Total Invested</dt>
                    <dd className="font-mono">{fmt(summary.totalInvested)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Market Value</dt>
                    <dd className="font-mono">{fmt(summary.totalMarketValue)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Gain/Loss</dt>
                    <dd className={`font-mono ${positive ? "text-emerald-600" : "text-red-500"}`}>
                      {positive ? "+" : ""}
                      {fmt(summary.gain)}
                      {summary.gainPct !== null && (
                        <span className="ml-1 text-xs">
                          ({positive ? "+" : ""}
                          {fmt(summary.gainPct)}%)
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
