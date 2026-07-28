/**
 * Development seed: a demo user with one portfolio, two assets, matching BUY
 * transactions, and the holdings those transactions produce. Idempotent — a
 * second run is a no-op once the demo portfolio exists.
 *
 * Run via `pnpm exec prisma db seed --config=./prisma/prisma.config.ts`
 * (or automatically after `prisma migrate dev`/`migrate reset`).
 */
import { createPrismaClient } from "../src/prisma-client.js";

const prisma = createPrismaClient();

const DEMO_EMAIL = "demo@pp-track.local";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: { email: DEMO_EMAIL, name: "Demo User" },
    update: {},
  });

  const existing = await prisma.portfolio.findFirst({ where: { userId: user.id } });
  if (existing) {
    console.log(`Demo user already seeded (portfolio "${existing.name}") — nothing to do.`);
    return;
  }

  const portfolio = await prisma.portfolio.create({
    data: { userId: user.id, name: "Demo Portfolio", isDefault: true },
  });

  const seedPositions = [
    { ticker: "AAPL", name: "Apple Inc.", assetType: "EQUITY", exchange: "NMS", quantity: "10", price: "180.5" },
    { ticker: "BTC-USD", name: "Bitcoin USD", assetType: "CRYPTOCURRENCY", exchange: "CCC", quantity: "0.05", price: "60000" },
  ];

  for (const p of seedPositions) {
    const asset = await prisma.asset.upsert({
      where: { ticker_exchange: { ticker: p.ticker, exchange: p.exchange } },
      create: { ticker: p.ticker, name: p.name, assetType: p.assetType, exchange: p.exchange, currency: "USD" },
      update: {},
    });

    await prisma.transaction.create({
      data: {
        portfolioId: portfolio.id,
        assetId: asset.id,
        type: "BUY",
        quantity: p.quantity,
        price: p.price,
        currency: "USD",
        transactedAt: new Date("2026-01-15T12:00:00.000Z"),
      },
    });

    // A single BUY with no fee: the holding is exactly quantity @ price.
    await prisma.holding.create({
      data: { portfolioId: portfolio.id, assetId: asset.id, quantity: p.quantity, avgCostBasis: p.price },
    });

    console.log(`  ✓ ${p.ticker} — ${p.quantity} @ ${p.price}`);
  }

  console.log(`Seeded "${portfolio.name}" for ${DEMO_EMAIL}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
