import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import CreatePortfolioDialog from "../_components/CreatePortfolioDialog";

interface Portfolio {
  id: string;
  name: string;
  isDefault: boolean;
  currency: string;
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

export default async function PortfoliosPage() {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const serverUrl = process.env.SERVER_API_URL ?? "http://localhost:3001";

  const res = await serverFetch(`${serverUrl}/api/portfolios`, userId);
  const portfolios: Portfolio[] = await res.json();

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Portfolios</h1>
        <CreatePortfolioDialog />
      </div>

      {portfolios.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted-foreground">
          No portfolios yet. Create one to get started.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border p-5 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{p.name}</span>
                {p.isDefault && (
                  <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">
                    Default
                  </span>
                )}
              </div>
              <span className="text-sm text-muted-foreground">{p.currency}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
