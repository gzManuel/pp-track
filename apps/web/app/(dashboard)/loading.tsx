// Route-level loading skeleton shown while the dashboard pages fetch from the
// backend, so navigation gives immediate feedback instead of blocking silently.
export default function DashboardLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="h-10 w-full rounded-md bg-muted md:w-44" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 w-24 rounded-md bg-muted" />
          <div className="h-9 w-9 rounded-md bg-muted" />
          <div className="h-9 w-36 rounded-md bg-muted" />
        </div>
      </div>
      <div className="mb-10 grid gap-4 md:grid-cols-2">
        <div className="h-[280px] rounded-lg border bg-muted/40 sm:h-[350px]" />
        <div className="h-[280px] rounded-lg border bg-muted/40 sm:h-[350px]" />
      </div>
      <div className="h-64 rounded-lg border bg-muted/40" />
    </div>
  );
}
