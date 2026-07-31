import { Prisma, type PrismaClient } from "@prisma/client";
import { vi, type Mock } from "vitest";

/**
 * A hand-rolled Prisma double for route-level tests.
 *
 * Route tests exist to verify the HTTP layer — auth enforcement, param/body
 * validation, ownership 404s, status codes, and response-schema serialization.
 * None of that needs a real database, and a stub keeps `pnpm test` runnable with
 * no Postgres. The arithmetic these routes delegate to (`replayPosition`,
 * `computeRebuild`) is covered directly in `services/holdings.test.ts`.
 *
 * Every delegate method is a `vi.fn()` so tests can set per-case return values
 * and assert on the arguments the handler passed down.
 */

type MockDelegate<T extends string> = Record<T, Mock>;

/**
 * The stub's shape, written out rather than inferred: `tsc` cannot name the
 * inferred type without pointing at a pnpm-internal `@vitest/spy` path.
 */
export interface StubPrisma {
  portfolio: MockDelegate<"findMany" | "findFirst" | "findUnique" | "count" | "create" | "update" | "delete">;
  transaction: MockDelegate<"findMany" | "findFirst" | "create" | "update" | "delete">;
  holding: MockDelegate<"findMany" | "findUnique" | "create" | "update" | "delete">;
  asset: MockDelegate<"findMany" | "findFirst" | "findUnique" | "create" | "update">;
  priceSnapshot: MockDelegate<"create" | "deleteMany">;
  user: MockDelegate<"upsert">;
  $queryRaw: Mock;
  $executeRaw: Mock;
  $disconnect: Mock;
  $transaction: Mock;
}

function delegate<T extends string>(...methods: T[]): MockDelegate<T> {
  return Object.fromEntries(methods.map((m) => [m, vi.fn()])) as MockDelegate<T>;
}

export function createStubPrisma(): StubPrisma {
  const stub: StubPrisma = {
    portfolio: delegate("findMany", "findFirst", "findUnique", "count", "create", "update", "delete"),
    transaction: delegate("findMany", "findFirst", "create", "update", "delete"),
    holding: delegate("findMany", "findUnique", "create", "update", "delete"),
    asset: delegate("findMany", "findFirst", "findUnique", "create", "update"),
    priceSnapshot: delegate("create", "deleteMany"),
    user: delegate("upsert"),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $disconnect: vi.fn(),
    // Interactive transactions run the callback against the same stub, so a
    // handler's `tx.*` calls land on the delegates the test configured.
    $transaction: vi.fn((arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => unknown)(stub) : arg)),
  };

  return stub;
}

/** The stub, typed as a `PrismaClient` for handing to `buildApp`. */
export function asPrismaClient(stub: StubPrisma): PrismaClient {
  return stub as unknown as PrismaClient;
}

/** Shorthand for the Decimal values Prisma returns on money columns. */
export function dec(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}
