import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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

function serverFetch(url: string, userId: string) {
  return fetch(url, {
    headers: {
      "x-internal-secret": process.env.INTERNAL_API_SECRET!,
      "x-user-id": userId,
    },
    cache: "no-store",
  });
}

async function getSummary(
  serverUrl: string,
  userId: string,
  portfolioId: string
): Promise<PortfolioSummary> {
  const holdingsRes = await serverFetch(
    `${serverUrl}/api/portfolios/${portfolioId}/holdings`,
    userId
  );
  const rawHoldings: RawHolding[] = await holdingsRes.json();

  const tickers = rawHoldings.map((h) => h.asset.ticker).join(",");
  const priceMap: Record<string, number> = {};
  if (tickers) {
    const pricesRes = await fetch(
      `${serverUrl}/api/prices?tickers=${encodeURIComponent(tickers)}`,
      { cache: "no-store" }
    );
    const prices: { ticker: string; price?: string }[] = await pricesRes.json();
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
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const serverUrl = process.env.SERVER_API_URL ?? "http://localhost:3001";

  const res = await serverFetch(`${serverUrl}/api/portfolios`, userId);
  const portfolios: Portfolio[] = await res.json();

  const summaries = await Promise.all(
    portfolios.map((p) => getSummary(serverUrl, userId, p.id))
  );

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Portfolios</h1>
        <CreatePortfolioDialog />
      </div>

      {portfolios.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted-foreground">
          No portfolios yet. Create one to get started.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((p, i) => {
            const summary = summaries[i]!;
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
                    {p.isDefault && (
                      <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">
                        Default
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {p.currency}
                  </span>
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
                    <dd
                      className={`font-mono ${positive ? "text-emerald-600" : "text-red-500"}`}
                    >
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
