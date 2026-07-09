"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/shadcn/Button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/shadcn/Command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/Popover";
import { cn } from "@/lib/utils";

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "mr-2 flex size-4 items-center justify-center rounded-sm border border-primary",
        checked ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
      )}
    >
      <Check className="size-3" />
    </span>
  );
}

export default function PortfolioSwitcher({
  portfolios,
  selectedIds,
  allSelected,
}: {
  portfolios: { id: string; name: string }[];
  selectedIds: string[];
  allSelected: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  function push(value: string) {
    const next = new URLSearchParams(params);
    next.set("portfolio", value);
    router.push(`${pathname}?${next.toString()}`);
  }

  // Build the param value from a set of selected ids: every id → "all",
  // some → comma-joined ids, none → "none".
  function pushIds(ids: string[]) {
    if (ids.length === 0) push("none");
    else if (ids.length === portfolios.length) push("all");
    else push(ids.join(","));
  }

  function toggle(id: string) {
    const current = allSelected ? portfolios.map((p) => p.id) : selectedIds;
    const nextIds = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    pushIds(nextIds);
  }

  function toggleAll() {
    push(allSelected ? "none" : "all");
  }

  function triggerLabel() {
    if (allSelected) return "All Portfolios";
    if (selectedIds.length === 0) return "No portfolios";
    if (selectedIds.length === 1) {
      return portfolios.find((p) => p.id === selectedIds[0])?.name ?? "1 portfolio";
    }
    return `${String(selectedIds.length)} portfolios`;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="lg" role="combobox" aria-expanded={open} className="w-44 justify-between font-normal">
          <span className="truncate">{triggerLabel()}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0">
        <Command>
          <CommandInput placeholder="Search portfolios..." />
          <CommandList>
            <CommandEmpty>No portfolios found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="All Portfolios" onSelect={toggleAll}>
                <CheckBox checked={allSelected} />
                All Portfolios
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {portfolios.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  onSelect={() => {
                    toggle(p.id);
                  }}
                >
                  <CheckBox checked={allSelected || selectedIds.includes(p.id)} />
                  {p.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
