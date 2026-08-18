/**
 * Route-transition state (UI_SPEC §5: "hold previous render at 50% opacity, no
 * skeleton jumps"). App Router can't literally hold the old page, so this is
 * the closest honest equivalent: a dimmed frame in the page's own geometry
 * with a working progress bar, never a blank screen.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4 opacity-50" aria-busy="true" aria-label="Loading view">
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-24 animate-pulse" />
        ))}
      </div>
      <div className="card h-64 animate-pulse" />
      <div className="card h-48 animate-pulse" />
    </div>
  );
}
