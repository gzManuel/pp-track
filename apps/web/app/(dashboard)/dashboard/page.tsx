import { getUserId } from "@/lib/auth";
import { serverBaseUrl, serverFetch } from "@/lib/server-api";
import AllocationChart from "../_components/AllocationChart";
import CreatePortfolioDialog from "../_components/CreatePortfolioDialog";
import CurrencyToggle from "../_components/CurrencyToggle";
import GainLossChart from "../_components/GainLossChart";
import HoldingsTable from "../_components/HoldingsTable";
import LogTransactionDialog from "../_components/LogTransactionDialog";
import PortfolioSwitcher from "../_components/PortfolioSwitcher";
import RefreshButton from "../_components/RefreshButton";

interface RawHolding {
  id: string;
  quantity: string;
  avgCostBasis: string;
  asset: { ticker: string; name: string; currency: string; assetType: string };
}

export interface EnrichedHolding {
  id: string;
  ticker: string;
  name: string;
  currency: string;
  assetType: string;
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ currency?: string; portfolio?: string }> }) {
  const userId = await getUserId();

  const { currency, portfolio } = await searchParams;
  const ars = currency?.toUpperCase() === "ARS";

  const portfoliosRes = await serverFetch("/api/portfolios", { userId });
  const portfolios = (await portfoliosRes.json()) as Portfolio[];

  // Resolve which portfolios to show. Absent param keeps the old default (the
  // default/first portfolio); "all" aggregates everything; "none" is an explicit
  // empty selection; a comma list selects a subset.
  const showAll = portfolio === "all";
  const explicitNone = portfolio === "none";
  const ids = portfolio && portfolio !== "all" && portfolio !== "none" ? portfolio.split(",").filter(Boolean) : [];
  const defaultPortfolio = portfolios.find((p) => p.isDefault) ?? portfolios[0];
  let selectedPortfolios: Portfolio[];
  if (showAll) {
    selectedPortfolios = portfolios;
  } else if (ids.length > 0) {
    selectedPortfolios = portfolios.filter((p) => ids.includes(p.id));
  } else if (explicitNone || !defaultPortfolio) {
    selectedPortfolios = [];
  } else {
    selectedPortfolios = [defaultPortfolio];
  }

  if (portfolios.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <h1 className="text-xl font-semibold">No portfolio yet</h1>
        <p className="text-sm text-muted-foreground">Create one to start tracking your investments.</p>
        <CreatePortfolioDialog />
      </div>
    );
  }

  const selectedIds = selectedPortfolios.map((p) => p.id);
  const allSelected = showAll || (!explicitNone && ids.length === 0);

  const primaryPortfolio = selectedPortfolios[0];
  if (!primaryPortfolio) {
    return (
      <>
        <div className="mb-6 flex items-center justify-between">
          <PortfolioSwitcher portfolios={portfolios} selectedIds={selectedIds} allSelected={allSelected} />
        </div>
        <p className="py-20 text-center text-sm text-muted-foreground">
          No portfolios selected. Pick one from the switcher to see your positions.
        </p>
      </>
    );
  }

  // The selected portfolios are aggregated; the same asset across portfolios is
  // merged into one row below.
  const loadedPortfolios = selectedPortfolios;
  const holdingsLists: RawHolding[][] = await Promise.all(
    loadedPortfolios.map((p) => serverFetch(`/api/portfolios/${p.id}/holdings`, { userId }).then((r) => r.json() as Promise<RawHolding[]>)),
  );
  const rawHoldings: RawHolding[] = holdingsLists.flat();

  // Merge positions by ticker so the same asset held in several portfolios
  // collapses into a single row with summed shares and blended cost basis.
  const byTicker = new Map<
    string,
    {
      id: string;
      ticker: string;
      name: string;
      currency: string;
      assetType: string;
      shares: number;
      costBasis: number;
    }
  >();
  for (const h of rawHoldings) {
    const shares = Number(h.quantity);
    const costBasis = shares * Number(h.avgCostBasis);
    const existing = byTicker.get(h.asset.ticker);
    if (existing) {
      existing.shares += shares;
      existing.costBasis += costBasis;
    } else {
      byTicker.set(h.asset.ticker, {
        id: h.id,
        ticker: h.asset.ticker,
        name: h.asset.name,
        currency: h.asset.currency,
        assetType: h.asset.assetType,
        shares,
        costBasis,
      });
    }
  }
  const positions = [...byTicker.values()];

  const tickers = positions.map((p) => p.ticker).join(",");
  const priceMap: Record<string, number> = {};
  if (tickers) {
    const pricesRes = await fetch(`${serverBaseUrl()}/api/prices?tickers=${encodeURIComponent(tickers)}${ars ? "&currency=ARS" : ""}`, {
      cache: "no-store",
    });
    const prices = (await pricesRes.json()) as { ticker: string; price?: string }[];
    prices
      .filter((p) => p.price)
      .forEach((p) => {
        priceMap[p.ticker] = Number(p.price);
      });
  }

  const enrichedHoldings: EnrichedHolding[] = positions.map((p) => {
    const avgCost = p.shares !== 0 ? p.costBasis / p.shares : 0;
    const currentPrice = priceMap[p.ticker] ?? null;
    const marketValue = currentPrice !== null ? p.shares * currentPrice : null;
    const gain = marketValue !== null ? marketValue - p.costBasis : null;
    const gainPct = gain !== null && p.costBasis !== 0 ? (gain / p.costBasis) * 100 : null;
    return {
      id: p.id,
      ticker: p.ticker,
      name: p.name,
      currency: p.currency,
      assetType: p.assetType,
      shares: p.shares,
      avgCost,
      costBasis: p.costBasis,
      currentPrice,
      marketValue,
      gain,
      gainPct,
      portfolioPct: null,
    };
  });

  const totalMarketValue = enrichedHoldings.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);

  enrichedHoldings.forEach((h) => {
    h.portfolioPct = totalMarketValue > 0 && h.marketValue !== null ? (h.marketValue / totalMarketValue) * 100 : null;
  });

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <PortfolioSwitcher portfolios={portfolios} selectedIds={selectedIds} allSelected={allSelected} />
        <div className="flex items-center gap-2">
          <CurrencyToggle />
          <RefreshButton />
          <LogTransactionDialog portfolios={portfolios} defaultPortfolioId={primaryPortfolio.id} />
        </div>
      </div>
      <section className="mb-10 grid gap-4 md:grid-cols-2">
        <AllocationChart holdings={enrichedHoldings} priceCurrency={ars ? "ARS" : "USD"} />
        <GainLossChart holdings={enrichedHoldings} priceCurrency={ars ? "ARS" : "USD"} />
      </section>
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Positions</h2>
        <HoldingsTable holdings={enrichedHoldings} priceCurrency={ars ? "ARS" : "USD"} />
      </section>
    </>
  );
}
