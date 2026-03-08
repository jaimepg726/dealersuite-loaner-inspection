/**
 * Full-screen loading spinner shown during auth hydration and page transitions.
 */
export default function LoadingScreen({ message = 'Loading…' }) {
  return (
    <div className="fixed inset-0 bg-brand-dark flex flex-col items-center justify-center gap-5">
      {/* Spinner */}
      <div className="w-14 h-14 border-4 border-brand-accent border-t-brand-blue rounded-full animate-spin" />
      <p className="text-gray-400 text-base font-medium">{message}</p>
    </div>
  )
}
