/**
 * DealerSuite — Skeleton Card (Step 57)
 * Proper skeleton that matches the shape of real content cards.
 */
export default function SkeletonCard({ lines = 2, tall = false }) {
  return (
    <div className={`card animate-pulse ${tall ? 'h-32' : 'h-20'}`}>
      <div className="flex flex-col gap-2 justify-center h-full">
        <div className="h-3 bg-brand-accent rounded-full w-1/3" />
        {lines >= 2 && <div className="h-3 bg-brand-accent rounded-full w-2/3" />}
        {lines >= 3 && <div className="h-3 bg-brand-accent rounded-full w-1/2" />}
      </div>
    </div>
  )
}

export function SkeletonList({ count = 3, lines = 2, tall = false }) {
  return (
    <div className="flex flex-col gap-3">
      {[...Array(count)].map((_, i) => (
        <SkeletonCard key={i} lines={lines} tall={tall} />
      ))}
    </div>
  )
}
