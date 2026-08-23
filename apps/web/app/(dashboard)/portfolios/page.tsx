import Link from "next/link";
import { getUserId } from "@/lib/auth";
import { serverFetchJson } from "@/lib/server-api";
import { fetchHoldings, fetchPriceData, summarizeHoldings } from "@/lib/holdings";
import { currencySymbol, parseDisplayCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/utils";
import type { Portfolio } from "@/lib/types";
import Money from "../_components/Money";
import CreatePortfolioDialog from "../_components/portfolio/CreatePortfolioDialog";

export default async function PortfoliosPage({ searchParams }: { searchParams: Promise<{ currency?: string }> }) {
  const userId = await getUserId();

  const { currency } = await searchParams;
  const view = parseDisplayCurrency(currency);

  const portfolios = await serverFetchJson<Portfolio[]>("/api/portfolios", { userId });

  // Fetch each portfolio's holdings in parallel, then price the union of all
  // tickers with a single /api/prices call instead of one call per portfolio.
  const holdingsLists = await Promise.all(portfolios.map((p) => fetchHoldings(userId, p.id)));
  const allTickers = holdingsLists.flat().map((h) => h.asset.ticker);
  const { prices } = await fetchPriceData(allTickers, view);

  const cards = portfolios.map((p, i) => ({
    portfolio: p,
    summary: summarizeHoldings(holdingsLists[i] ?? [], prices, view),
  }));

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
                className="rounded-lg border p-5 flex flex-col gap-3 transition-colors hover:bg-muted/50 hover:border-foreground/20 active:bg-muted/50 active:border-foreground/20"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{p.name}</span>
                    {p.isDefault && <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">Default</span>}
                  </div>
                  <span className="text-sm text-muted-foreground">{view}</span>
                </div>

                <dl className="flex flex-col gap-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Total Invested</dt>
                    <dd className="font-mono">
                      {currencySymbol(view)} <Money value={summary.totalInvested} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Market Value</dt>
                    <dd className="font-mono">
                      {currencySymbol(view)} <Money value={summary.totalMarketValue} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Gain/Loss</dt>
                    <dd className={`font-mono ${positive ? "text-emerald-600" : "text-red-500"}`}>
                      <Money value={summary.gain} signed />
                      {summary.gainPct !== null && (
                        <span className="ml-1 text-xs">
                          ({positive ? "+" : ""}
                          {formatMoney(summary.gainPct)}%)
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
