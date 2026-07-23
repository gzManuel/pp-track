"use client";

import { useEffect } from "react";
import { Button } from "@/components/shadcn/Button";

// Route-level error boundary for the dashboard pages: a backend hiccup renders
// a friendly retry screen instead of Next's unstyled 500 page. The real error
// is logged for debugging; the user never sees internal details.
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">We couldn&apos;t load your data. The backend may be temporarily unavailable.</p>
      <Button
        onClick={() => {
          reset();
        }}
      >
        Try again
      </Button>
    </div>
  );
}
