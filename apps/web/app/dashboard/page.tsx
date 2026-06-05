import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import CreatePortfolioDialog from "./_components/CreatePortfolioDialog";
import HoldingsTable from "./_components/HoldingsTable";
import LogTransactionForm from "./_components/LogTransactionForm";
import RefreshButton from "./_components/RefreshButton";

interface RawHolding {
  id: string;
  quantity: string;
  avgCostBasis: string;
  asset: { ticker: string; name: string; currency: string };
}

export interface EnrichedHolding {
  id: string;
  ticker: string;
  name: string;
  currency: string;
  shares: number;
  avgCost: number;
  costBasis: number;
  currentPrice: number | null;
  marketValue: number | null;
  gain: number | null;
  gainPct: number | null;
  portfolioPct: number | null;
}

interface Portfolio {
  id: string;
  name: string;
  isDefault: boolean;
  currency: string;
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

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const serverUrl = process.env.SERVER_API_URL ?? "http://localhost:3001";

  const portfoliosRes = await serverFetch(`${serverUrl}/api/portfolios`, userId);
  const portfolios: Portfolio[] = await portfoliosRes.json();
  const defaultPortfolio = portfolios.find((p) => p.isDefault) ?? portfolios[0];

  if (!defaultPortfolio) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <h1 className="text-xl font-semibold">No portfolio yet</h1>
        <p className="text-sm text-muted-foreground">
          Create one to start tracking your investments.
        </p>
        <CreatePortfolioDialog />
      </div>
    );
  }

  const holdingsRes = await serverFetch(
    `${serverUrl}/api/portfolios/${defaultPortfolio.id}/holdings`,
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

  const enrichedHoldings: EnrichedHolding[] = rawHoldings.map((h) => {
    const shares = Number(h.quantity);
    const avgCost = Number(h.avgCostBasis);
    const costBasis = shares * avgCost;
    const currentPrice = priceMap[h.asset.ticker] ?? null;
    const marketValue = currentPrice !== null ? shares * currentPrice : null;
    const gain = marketValue !== null ? marketValue - costBasis : null;
    const gainPct = gain !== null ? (gain / costBasis) * 100 : null;
    return {
      id: h.id,
      ticker: h.asset.ticker,
      name: h.asset.name,
      currency: h.asset.currency,
      shares,
      avgCost,
      costBasis,
      currentPrice,
      marketValue,
      gain,
      gainPct,
      portfolioPct: null,
    };
  });

  const totalMarketValue = enrichedHoldings.reduce(
    (sum, h) => sum + (h.marketValue ?? 0),
    0
  );
  enrichedHoldings.forEach((h) => {
    h.portfolioPct =
      totalMarketValue > 0 && h.marketValue !== null
        ? (h.marketValue / totalMarketValue) * 100
        : null;
  });

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{defaultPortfolio.name}</h1>
        <RefreshButton />
      </div>
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Positions</h2>
        <HoldingsTable holdings={enrichedHoldings} />
      </section>
      <section className="max-w-2xl">
        <h2 className="mb-3 text-lg font-medium">Log transaction</h2>
        <LogTransactionForm portfolioId={defaultPortfolio.id} />
      </section>
    </>
  );
}
