import { getUserId } from "@/lib/auth";
import { serverFetchJson } from "@/lib/server-api";
import { parsePortfolioSelection } from "@/lib/portfolio-selection";
import type { Portfolio, TransactionPage } from "@/lib/types";
import LogTransactionForm from "../_components/LogTransactionForm";
import PortfolioSwitcher from "../_components/PortfolioSwitcher";
import TransactionsTable from "../_components/TransactionsTable";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ portfolio?: string }> }) {
  const userId = await getUserId();

  const { portfolio } = await searchParams;

  const portfolios = await serverFetchJson<Portfolio[]>("/api/portfolios", { userId });

  const { selected: selectedPortfolios, selectedIds, allSelected } = parsePortfolioSelection(portfolio, portfolios);

  const firstPortfolio = portfolios[0];
  if (!firstPortfolio) {
    return <p className="py-20 text-center text-sm text-muted-foreground">No portfolio yet. Create one from the Portfolios tab.</p>;
  }

  const primaryPortfolio = selectedPortfolios[0] ?? portfolios.find((p) => p.isDefault) ?? firstPortfolio;

  if (selectedPortfolios.length === 0) {
    return (
      <>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Transactions</h1>
          <PortfolioSwitcher portfolios={portfolios} selectedIds={selectedIds} allSelected={allSelected} />
        </div>
        <p className="py-20 text-center text-sm text-muted-foreground">
          No portfolios selected. Pick one from the switcher to see transactions.
        </p>
      </>
    );
  }

  // Fetch per portfolio (no aggregate endpoint), tag each transaction with its
  // portfolio so the table can label rows and target deletes correctly, then
  // re-sort the merged list since each portfolio's list is sorted on its own.
  // The API paginates; the page shows the most recent 200 per portfolio (a
  // "load more" flow can consume nextCursor later if history outgrows this).
  const txLists = await Promise.all(
    selectedPortfolios.map((p) =>
      serverFetchJson<TransactionPage>(`/api/portfolios/${p.id}/transactions?take=200`, {
        userId,
      }).then(({ items }) => items.map((tx) => ({ ...tx, portfolioId: p.id, portfolioName: p.name }))),
    ),
  );
  const transactions = txLists.flat().sort((a, b) => new Date(b.transactedAt).getTime() - new Date(a.transactedAt).getTime());

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <PortfolioSwitcher portfolios={portfolios} selectedIds={selectedIds} allSelected={allSelected} />
      </div>
      <section className="mb-10 max-w-2xl">
        <h2 className="mb-3 text-lg font-medium">Log transaction</h2>
        <LogTransactionForm portfolios={portfolios} defaultPortfolioId={primaryPortfolio.id} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-medium">History</h2>
        <TransactionsTable transactions={transactions} showPortfolio={selectedPortfolios.length > 1} portfolios={portfolios} />
      </section>
    </>
  );
}
