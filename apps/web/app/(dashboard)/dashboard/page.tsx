import { getUserId } from "@/lib/auth";
import { serverFetchJson } from "@/lib/server-api";
import { enrichPositions, fetchHoldings, fetchPriceData, mergeByTicker } from "@/lib/holdings";
import { parsePortfolioSelection } from "@/lib/portfolio-selection";
import type { Portfolio } from "@/lib/types";
import AllocationChart from "../_components/charts/AllocationChart";
import CreatePortfolioDialog from "../_components/portfolio/CreatePortfolioDialog";
import CurrencyToggle from "../_components/CurrencyToggle";
import GainLossChart from "../_components/charts/GainLossChart";
import HoldingsTable from "../_components/portfolio/HoldingsTable";
import LogTransactionDialog from "../_components/transactions/LogTransactionDialog";
import PortfolioSwitcher from "../_components/portfolio/PortfolioSwitcher";
import RefreshButton from "../_components/RefreshButton";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ currency?: string; portfolio?: string }> }) {
  const userId = await getUserId();

  const { currency, portfolio } = await searchParams;
  const ars = currency?.toUpperCase() === "ARS";

  const portfolios = await serverFetchJson<Portfolio[]>("/api/portfolios", { userId });

  if (portfolios.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <h1 className="text-xl font-semibold">No portfolio yet</h1>
        <p className="text-sm text-muted-foreground">Create one to start tracking your investments.</p>
        <CreatePortfolioDialog />
      </div>
    );
  }

  const { selected: selectedPortfolios, selectedIds, allSelected } = parsePortfolioSelection(portfolio, portfolios);

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
  // merged into one row.
  const holdingsLists = await Promise.all(selectedPortfolios.map((p) => fetchHoldings(userId, p.id)));
  const positions = mergeByTicker(holdingsLists.flat());

  const priceData = await fetchPriceData(
    positions.map((p) => p.ticker),
    ars,
  );
  const enrichedHoldings = enrichPositions(positions, priceData);

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
