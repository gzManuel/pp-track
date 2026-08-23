"use client";

import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/shadcn/Button";
import { useMoneyVisibility } from "@/lib/money-visibility";

/** Global switch that masks every monetary amount across the dashboard pages. */
export default function HidePricesToggle() {
  const { hidden, setHidden } = useMoneyVisibility();

  return (
    <Button
      variant="outline"
      size="icon"
      className="size-10 md:size-8"
      onClick={() => {
        setHidden(!hidden);
      }}
      aria-label={hidden ? "Show prices" : "Hide prices"}
      aria-pressed={hidden}
    >
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </Button>
  );
}
