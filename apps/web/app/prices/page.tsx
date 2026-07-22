import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/Table";
import { serverFetch } from "@/lib/server-api";

// Live prices are fetched per request (no-store); never prerender this route.
// Rendering it at build time (NODE_ENV=production) would call serverFetch(),
// which requires SERVER_API_URL / INTERNAL_API_SECRET — unset during `next build` in CI.
export const dynamic = "force-dynamic";

const TICKERS = ["AAPL", "AAPLD.BA", "SPYDD.BA"];

interface PriceResult {
  ticker: string;
  price: string;
  currency: string;
  recordedAt: string;
  cached: boolean;
  error?: string;
}

async function getPrices(): Promise<PriceResult[]> {
  const res = await serverFetch(`/api/prices?tickers=${TICKERS.join(",")}`);

  if (!res.ok) throw new Error("Failed to fetch prices");
  return (await res.json()) as PriceResult[];
}

export default async function PricesPage() {
  const prices = await getPrices();

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Asset Prices</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticker</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prices.map((p) => (
            <TableRow key={p.ticker}>
              <TableCell className="font-mono font-medium">{p.ticker}</TableCell>
              <TableCell className="text-right font-mono">{p.error ? "—" : Number(p.price).toFixed(2)}</TableCell>
              <TableCell>{p.error ? "—" : p.currency}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{p.error ?? new Date(p.recordedAt).toLocaleTimeString()}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{p.cached ? "cache" : "live"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
