"use client";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/shadcn/Button";
import { useTransition } from "react";

export default function RefreshButton() {
  const router = useRouter();
  // useTransition tracks the actual refresh round-trip, so the spinner stops
  // when the new data has landed — not after an arbitrary timeout.
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="icon" onClick={handleRefresh} aria-label="Refresh prices" disabled={isPending}>
      <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
    </Button>
  );
}
