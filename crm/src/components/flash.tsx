/** Shows ?error= from a redirected server action. */
export function Flash({ error }: { error?: string | string[] }) {
  const msg = Array.isArray(error) ? error[0] : error;
  if (!msg) return null;
  return <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{msg}</p>;
}
