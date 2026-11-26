/** Compatibility entry: the shared workspace is the single job/approval surface. */
export default function CooCockpit() {
  return (
    <iframe
      src="/workspaces/coo/dashboard.html"
      title="COO · Aufträge und Ergebnisse"
      style={{ width: '100%', height: '100dvh', border: 0 }}
    />
  )
}
