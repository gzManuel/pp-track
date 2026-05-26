import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  const serverUrl = process.env.SERVER_API_URL ?? "http://localhost:3001";
  const res = await fetch(
    `${serverUrl}/api/prices?tickers=${TICKERS.join(",")}`,
    { cache: "no-store" }
  );

  if (!res.ok) throw new Error("Failed to fetch prices");
  return res.json();
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
              <TableCell className="text-right font-mono">
                {p.error ? "—" : Number(p.price).toFixed(2)}
              </TableCell>
              <TableCell>{p.error ? "—" : p.currency}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {p.error ? p.error : new Date(p.recordedAt).toLocaleTimeString()}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {p.cached ? "cache" : "live"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
