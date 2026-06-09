"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/Select";

export default function PortfolioSwitcher({
  portfolios,
  activeId,
}: {
  portfolios: { id: string; name: string }[];
  activeId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(portfolioId: string) {
    const next = new URLSearchParams(params);
    next.set("portfolio", portfolioId);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <Select value={activeId} onValueChange={select}>
      <SelectTrigger className="h-9 w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Portfolios</SelectItem>
        {portfolios.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
