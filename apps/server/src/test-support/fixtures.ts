import { dec } from "./stub-prisma.js";

/**
 * Row and payload fixtures shared by the route test suites.
 *
 * These mirror what Prisma returns (Decimals, Dates) rather than what the API
 * emits — the response schemas are the thing under test, so the tests must feed
 * them database-shaped input.
 */

export const SECRET = "test-secret-value";
export const USER_ID = "3f1e9a3c-64c9-4d7e-9c6a-2b8f0f6f9d11";
export const OTHER_USER_ID = "8c2d5b71-1f3a-4e60-9a2b-77c0d1e4f5a6";
export const PORTFOLIO_ID = "b81c0e2a-9d44-4c1b-8f2e-3a5d6c7b8e90";
export const OTHER_PORTFOLIO_ID = "f25a6b7c-8d90-4e12-a345-6b7c8d9e0f11";
export const TX_ID = "c92d1f3b-ae55-4d2c-9036-4b6e7d8c9f01";
export const ASSET_ID = "d03e2a4c-bf66-4e3d-a147-5c7f8e9d0a12";

/** Credentials for an authenticated request. */
export const auth = { "x-internal-secret": SECRET, "x-user-id": USER_ID };

export const portfolioRow = {
  id: PORTFOLIO_ID,
  userId: USER_ID,
  name: "Main",
  description: null,
  currency: "MEP",
  isDefault: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

export const assetRow = {
  id: ASSET_ID,
  ticker: "AAPL",
  name: "Apple Inc.",
  assetType: "EQUITY",
  exchange: "NMS",
  currency: "USD",
  metadata: null,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

export function transactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TX_ID,
    portfolioId: PORTFOLIO_ID,
    assetId: ASSET_ID,
    type: "BUY",
    quantity: dec("10"),
    price: dec("100"),
    fee: dec("0"),
    currency: "MEP",
    mepRate: dec("1500"),
    cclRate: dec("1600"),
    transactedAt: new Date("2026-01-15T12:00:00.000Z"),
    notes: null,
    createdAt: new Date("2026-01-15T12:00:00.000Z"),
    asset: { ticker: "AAPL", name: "Apple Inc." },
    ...overrides,
  };
}

export const validTransactionBody = {
  ticker: "AAPL",
  type: "BUY",
  quantity: 10,
  price: 100,
  currency: "MEP",
  transactedAt: "2026-01-15",
};

// `inject().json()` is `any`; these name the shape each assertion expects so the
// tests stay type-checked under the app's strict lint rules.
export interface ErrorBody {
  error: string;
}

export interface HoldingBody {
  quantity: string;
  avgCostBasis: string;
  avgCostBasisArs: string;
  avgCostBasisCcl: string;
}

export interface TransactionPageBody {
  items: { id: string }[];
  nextCursor: string | null;
}
