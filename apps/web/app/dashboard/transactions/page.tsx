import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import LogTransactionForm from "../_components/LogTransactionForm";
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

export default async function TransactionsPage() {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const serverUrl = process.env.SERVER_API_URL ?? "http://localhost:3001";

  const portfoliosRes = await serverFetch(`${serverUrl}/api/portfolios`, userId);
  const portfolios: Portfolio[] = await portfoliosRes.json();
  const defaultPortfolio = portfolios.find((p) => p.isDefault) ?? portfolios[0];

  if (!defaultPortfolio) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        No portfolio yet. Create one from the Portfolios tab.
      </p>
    );
  }

  const txRes = await serverFetch(
    `${serverUrl}/api/portfolios/${defaultPortfolio.id}/transactions`,
    userId
  );
  const transactions: Transaction[] = await txRes.json();

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Transactions</h1>
      <section className="mb-10 max-w-2xl">
        <h2 className="mb-3 text-lg font-medium">Log transaction</h2>
        <LogTransactionForm portfolioId={defaultPortfolio.id} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-medium">History</h2>
        <TransactionsTable transactions={transactions} />
      </section>
    </>
  );
}
