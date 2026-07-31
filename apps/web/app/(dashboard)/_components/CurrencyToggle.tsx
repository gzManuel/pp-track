"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CURRENCIES, type Currency } from "@repo/api-contract";
import { DEFAULT_CURRENCY, parseDisplayCurrency } from "@/lib/currency";
import { Button } from "@/components/shadcn/Button";

export default function CurrencyToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = parseDisplayCurrency(params.get("currency"));

  function select(currency: Currency) {
    const next = new URLSearchParams(params);
    // MEP is the default view, so it stays out of the URL.
    if (currency === DEFAULT_CURRENCY) next.delete("currency");
    else next.set("currency", currency);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div role="group" aria-label="Display currency" className="inline-flex rounded-md border p-0.5">
      {CURRENCIES.map((opt) => (
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
