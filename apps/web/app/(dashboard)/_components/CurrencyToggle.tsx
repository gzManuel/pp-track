"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/shadcn/Button";

const OPTIONS = ["USD", "ARS"] as const;

export default function CurrencyToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get("currency")?.toUpperCase() === "ARS" ? "ARS" : "USD";

  function select(currency: (typeof OPTIONS)[number]) {
    const next = new URLSearchParams(params);
    if (currency === "ARS") next.set("currency", "ARS");
    else next.delete("currency");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div role="group" aria-label="Display currency" className="inline-flex rounded-md border p-0.5">
      {OPTIONS.map((opt) => (
        <Button
          key={opt}
          variant={active === opt ? "default" : "ghost"}
          size="sm"
          className="h-7 px-3"
          aria-pressed={active === opt}
          onClick={() => {
            select(opt);
          }}
        >
          {opt}
        </Button>
      ))}
    </div>
  );
}
