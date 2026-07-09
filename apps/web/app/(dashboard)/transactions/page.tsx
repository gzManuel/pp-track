import { getUserId } from "@/lib/auth";
import { serverFetch } from "@/lib/server-api";
import LogTransactionForm from "../_components/LogTransactionForm";
import PortfolioSwitcher from "../_components/PortfolioSwitcher";
import TransactionsTable from "../_components/TransactionsTable";

interface Portfolio {
  id: string;
  name: string;
  isDefault: boolean;
  currency: string;
}

interface Transaction {
  id: string;
  type: string;
  quantity: string;
  price: string;
  currency: string;
  fee: string;
  notes: string | null;
  transactedAt: string;
  asset: { ticker: string; name: string };
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ portfolio?: string }> }) {
  const userId = await getUserId();

  const { portfolio } = await searchParams;

  const portfoliosRes = await serverFetch("/api/portfolios", { userId });
  const portfolios = (await portfoliosRes.json()) as Portfolio[];

  // Default (no query param) shows every portfolio's transactions; "all" does
  // the same, "none" is an explicit empty selection, and a comma list narrows
  // to a subset.
  const showAll = portfolio === undefined || portfolio === "all";
  const explicitNone = portfolio === "none";
  const ids = !showAll && !explicitNone ? portfolio.split(",").filter(Boolean) : [];
  const selectedPortfolios = showAll ? portfolios : portfolios.filter((p) => ids.includes(p.id));

  const firstPortfolio = portfolios[0];
  if (!firstPortfolio) {
    return <p className="py-20 text-center text-sm text-muted-foreground">No portfolio yet. Create one from the Portfolios tab.</p>;
  }

  const selectedIds = selectedPortfolios.map((p) => p.id);
  const primaryPortfolio = selectedPortfolios[0] ?? portfolios.find((p) => p.isDefault) ?? firstPortfolio;

  if (selectedPortfolios.length === 0) {
    return (
      <>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Transactions</h1>
          <PortfolioSwitcher portfolios={portfolios} selectedIds={selectedIds} allSelected={showAll} />
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
  const loadedPortfolios = selectedPortfolios;
  const txLists = await Promise.all(
    loadedPortfolios.map((p) =>
      serverFetch(`/api/portfolios/${p.id}/transactions`, { userId })
        .then((r) => r.json())
        .then((txs: Transaction[]) => txs.map((tx) => ({ ...tx, portfolioId: p.id, portfolioName: p.name }))),
    ),
  );
  const transactions = txLists.flat().sort((a, b) => new Date(b.transactedAt).getTime() - new Date(a.transactedAt).getTime());

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <PortfolioSwitcher portfolios={portfolios} selectedIds={selectedIds} allSelected={showAll} />
      </div>
      <section className="mb-10 max-w-2xl">
        <h2 className="mb-3 text-lg font-medium">Log transaction</h2>
        <LogTransactionForm portfolios={portfolios} defaultPortfolioId={primaryPortfolio.id} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-medium">History</h2>
        <TransactionsTable transactions={transactions} showPortfolio={loadedPortfolios.length > 1} portfolios={portfolios} />
      </section>
    </>
  );
}
