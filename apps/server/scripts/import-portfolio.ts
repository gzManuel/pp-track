/**
 * Import portfolio holdings from a CSV file.
 *
 * Expected CSV format (header row required):
 *   Label,Total Price,Quantity
 *   AAPL,1500.00,10
 *   GGAL.BA,50000,200
 *
 * Usage:
 *   cd apps/server
 *   pnpm tsx scripts/import-portfolio.ts <path-to-csv> <user-email>
 *
 * - Looks up the user's default portfolio (or the first one found).
 * - For each row: upserts the Asset (fetching metadata from Yahoo Finance),
 *   then upserts the Holding (quantity + avg_cost_basis = Total Price / Quantity).
 * - Existing holdings are overwritten.
 */

import "dotenv/config";
import fs from "node:fs";
import readline from "node:readline";
import prisma from "../src/prisma";
import { fetchQuote } from "../src/services/yahoo-finance";

const [, , csvPath, userEmail] = process.argv;

if (!csvPath || !userEmail) {
  console.error("Usage: pnpm tsx scripts/import-portfolio.ts <path-to-csv> <user-email>");
  process.exit(1);
}

interface Row {
  ticker: string;
  totalPrice: number;
  quantity: number;
}

async function parseCSV(filePath: string): Promise<Row[]> {
  const rows: Row[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });

  let headerParsed = false;
  let labelIdx = 0;
  let totalPriceIdx = 1;
  let quantityIdx = 2;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const cols = trimmed.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));

    if (!headerParsed) {
      // Detect column positions from header (case-insensitive)
      labelIdx = cols.findIndex((c) => /label|ticker|symbol/i.test(c));
      totalPriceIdx = cols.findIndex((c) => /total.?price|spent|cost|amount/i.test(c));
      quantityIdx = cols.findIndex((c) => /quantity|qty|shares|stocks|units/i.test(c));

      if (labelIdx === -1) labelIdx = 0;
      if (totalPriceIdx === -1) totalPriceIdx = 1;
      if (quantityIdx === -1) quantityIdx = 2;

      headerParsed = true;
      continue;
    }

    const ticker = cols[labelIdx];
    const totalPrice = parseFloat(cols[totalPriceIdx]?.replace(/[^0-9.-]/g, "") ?? "0");
    const quantity = parseFloat(cols[quantityIdx]?.replace(/[^0-9.-]/g, "") ?? "0");

    if (!ticker || isNaN(totalPrice) || isNaN(quantity) || quantity === 0) {
      console.warn(`Skipping invalid row: ${line}`);
      continue;
    }

    rows.push({ ticker, totalPrice, quantity });
  }

  return rows;
}

async function main() {
  const rows = await parseCSV(csvPath);
  console.log(`Parsed ${rows.length} rows from ${csvPath}`);

  // Find user
  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) {
    console.error(`User not found: ${userEmail}`);
    process.exit(1);
  }

  // Find default portfolio (or first one)
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (!portfolio) {
    console.error(`No portfolio found for user ${userEmail}`);
    process.exit(1);
  }

  console.log(`Importing into portfolio: "${portfolio.name}" (${portfolio.id})`);

  let imported = 0;
  let failed = 0;

  for (const row of rows) {
    const { ticker, totalPrice, quantity } = row;
    const avgCostBasis = totalPrice / quantity;

    try {
      // Fetch asset metadata from Yahoo Finance
      const quote = await fetchQuote(ticker);

      // Upsert Asset
      const asset = await prisma.asset.upsert({
        where: { ticker_exchange: { ticker: quote.symbol, exchange: quote.exchange ?? "" } },
        create: {
          ticker: quote.symbol,
          name: quote.name,
          assetType: quote.quoteType,
          exchange: quote.exchange ?? "",
          currency: quote.currency,
        },
        update: {
          name: quote.name,
          assetType: quote.quoteType,
          currency: quote.currency,
        },
      });

      // Upsert Holding
      await prisma.holding.upsert({
        where: { portfolioId_assetId: { portfolioId: portfolio.id, assetId: asset.id } },
        create: {
          portfolioId: portfolio.id,
          assetId: asset.id,
          quantity: quantity.toString(),
          avgCostBasis: avgCostBasis.toString(),
        },
        update: {
          quantity: quantity.toString(),
          avgCostBasis: avgCostBasis.toString(),
        },
      });

      console.log(`  ✓ ${ticker} — qty: ${quantity}, avg cost: ${avgCostBasis.toFixed(4)}`);
      imported++;
    } catch (err) {
      console.error(`  ✗ ${ticker} — ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nDone. Imported: ${imported}, Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
