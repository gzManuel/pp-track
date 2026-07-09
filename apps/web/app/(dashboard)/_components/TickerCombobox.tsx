"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/shadcn/Button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/shadcn/Command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/Popover";
import { searchTickers, type TickerSearchResult } from "../actions";

function TickerOption({
  result,
  selected,
  onSelect,
}: {
  result: TickerSearchResult;
  selected: boolean;
  onSelect: (symbol: string) => void;
}) {
  return (
    <CommandItem
      value={result.symbol}
      // cmdk lowercases the onSelect arg, so select via the closed-over symbol.
      onSelect={() => {
        onSelect(result.symbol);
      }}
      className="flex items-center justify-between gap-2"
    >
      <div className="flex min-w-0 flex-col">
        <span className="font-medium">{result.symbol}</span>
        <span className="truncate text-xs text-muted-foreground">{result.name}</span>
      </div>
      <div className="flex items-center gap-2">
        {result.exchange && <span className="text-xs text-muted-foreground">{result.exchange}</span>}
        <Check className={cn("h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
      </div>
    </CommandItem>
  );
}

export default function TickerCombobox({ value, onChange }: { value: string; onChange: (ticker: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TickerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced server search; a stale flag drops out-of-order responses.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const found = await searchTickers(q);
          if (!cancelled) setResults(found);
        } catch {
          if (!cancelled) setResults([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const portfolio = results.filter((r) => r.source === "portfolio");
  const yahoo = results.filter((r) => r.source === "yahoo");

  function handleSelect(symbol: string) {
    onChange(symbol);
    setOpen(false);
    setQuery("");
  }

  let emptyMessage = "Type to search tickers.";
  if (loading) emptyMessage = "Searching…";
  else if (query.trim()) emptyMessage = "No results found.";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className={cn(!value && "text-muted-foreground")}>{value || "Search ticker…"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="e.g. AAPL, SPY.BA" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {portfolio.length > 0 && (
              <CommandGroup heading="Your portfolio">
                {portfolio.map((r) => (
                  <TickerOption key={`p-${r.symbol}`} result={r} selected={value === r.symbol} onSelect={handleSelect} />
                ))}
              </CommandGroup>
            )}
            {yahoo.length > 0 && (
              <CommandGroup heading="Search results">
                {yahoo.map((r) => (
                  <TickerOption key={`y-${r.symbol}`} result={r} selected={value === r.symbol} onSelect={handleSelect} />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
