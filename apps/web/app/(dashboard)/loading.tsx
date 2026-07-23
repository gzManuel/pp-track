// Route-level loading skeleton shown while the dashboard pages fetch from the
// backend, so navigation gives immediate feedback instead of blocking silently.
export default function DashboardLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-10 w-44 rounded-md bg-muted" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 rounded-md bg-muted" />
          <div className="h-9 w-9 rounded-md bg-muted" />
          <div className="h-9 w-36 rounded-md bg-muted" />
        </div>
      </div>
      <div className="mb-10 grid gap-4 md:grid-cols-2">
        <div className="h-[350px] rounded-lg border bg-muted/40" />
        <div className="h-[350px] rounded-lg border bg-muted/40" />
      </div>
      <div className="h-64 rounded-lg border bg-muted/40" />
    </div>
  );
}
