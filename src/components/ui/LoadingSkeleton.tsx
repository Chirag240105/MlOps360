export function SkeletonBlock({className = ''}: {className?: string}) {
  return <div className={`animate-pulse rounded bg-[#1B2130] ${className}`} />;
}

export function CardGridSkeleton({count = 4}: {count?: number}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({length: count}).map((_, idx) => (
        <div key={idx} className="rounded-lg border border-[#232A3C] bg-[#151923] p-4 space-y-3">
          <SkeletonBlock className="h-3.5 w-24" />
          <SkeletonBlock className="h-7 w-16" />
          <SkeletonBlock className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({rows = 5}: {rows?: number}) {
  return (
    <div className="rounded-lg border border-[#232A3C] bg-[#151923] p-4 space-y-3">
      <div className="flex items-center justify-between gap-4 border-b border-[#232A3C] pb-3">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-8 w-32" />
      </div>
      {Array.from({length: rows}).map((_, idx) => (
        <div key={idx} className="flex items-center justify-between gap-4 py-2">
          <SkeletonBlock className="h-4 w-1/4" />
          <SkeletonBlock className="h-4 w-1/5" />
          <SkeletonBlock className="h-4 w-1/6" />
          <SkeletonBlock className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
