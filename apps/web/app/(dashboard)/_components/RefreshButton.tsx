"use client";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/shadcn/Button";
import { useState } from "react";

export default function RefreshButton() {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);

  function handleRefresh() {
    setSpinning(true);
    router.refresh();
    setTimeout(() => setSpinning(false), 800);
  }

  return (
    <Button variant="outline" size="icon" onClick={handleRefresh}>
      <RefreshCw className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
    </Button>
  );
}
