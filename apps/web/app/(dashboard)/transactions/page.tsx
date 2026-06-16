import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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

function serverFetch(url: string, userId: string) {
  return fetch(url, {
    headers: {
      "x-internal-secret": process.env.INTERNAL_API_SECRET!,
      "x-user-id": userId,
    },
    cache: "no-store",
  });
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const serverUrl = process.env.SERVER_API_URL ?? "http://localhost:3001";

  const { portfolio } = await searchParams;

  const portfoliosRes = await serverFetch(`${serverUrl}/api/portfolios`, userId);
  const portfolios: Portfolio[] = await portfoliosRes.json();

  // Default (no query param) shows every portfolio's transactions; an explicit
  // portfolio id narrows the view to just that one.
  const showAll = portfolio === undefined || portfolio === "all";
  const selectedPortfolio =
    (portfolio && portfolios.find((p) => p.id === portfolio)) ||
    portfolios.find((p) => p.isDefault) ||
    portfolios[0];

  if (!selectedPortfolio) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        No portfolio yet. Create one from the Portfolios tab.
      </p>
    );
  }

  // Fetch per portfolio (no aggregate endpoint), tag each transaction with its
  // portfolio so the table can label rows and target deletes correctly, then
  // re-sort the merged list since each portfolio's list is sorted on its own.
  const loadedPortfolios = showAll ? portfolios : [selectedPortfolio];
  const txLists = await Promise.all(
    loadedPortfolios.map((p) =>
      serverFetch(`${serverUrl}/api/portfolios/${p.id}/transactions`, userId)
        .then((r) => r.json())
        .then((txs: Transaction[]) =>
          txs.map((tx) => ({ ...tx, portfolioId: p.id, portfolioName: p.name }))
        )
    )
  );
  const transactions = txLists
    .flat()
    .sort(
      (a, b) =>
        new Date(b.transactedAt).getTime() - new Date(a.transactedAt).getTime()
    );

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <PortfolioSwitcher
          portfolios={portfolios}
          activeId={showAll ? "all" : selectedPortfolio.id}
        />
      </div>
      <section className="mb-10 max-w-2xl">
        <h2 className="mb-3 text-lg font-medium">Log transaction</h2>
        <LogTransactionForm
          portfolios={portfolios}
          defaultPortfolioId={selectedPortfolio.id}
        />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-medium">History</h2>
        <TransactionsTable
          transactions={transactions}
          showPortfolio={showAll}
          portfolios={portfolios}
        />
      </section>
    </>
  );
}
