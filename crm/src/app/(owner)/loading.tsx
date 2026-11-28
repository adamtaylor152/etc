// Shown inside the app frame while a page's data loads: the shape of a page (title, tiles, a list), not a spinner.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton mb-2 h-9 w-56" />
      <div className="skeleton mb-6 h-4 w-80 max-w-full" />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[5.5rem] rounded-xl" />)}
      </div>
      <div className="rounded-xl border border-line bg-white p-4 shadow-card">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line-soft py-3 last:border-0">
            <div className="skeleton h-4 flex-1" /><div className="skeleton hidden h-4 w-32 sm:block" /><div className="skeleton h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
