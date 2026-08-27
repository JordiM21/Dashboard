export default function Loading() {
  return (
    <main className="page">
      <div className="page-header">
        <div style={{ width: "100%" }}>
          <div className="skeleton" style={{ height: 28, width: 220, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 14, width: 320 }} />
        </div>
      </div>
      <div className="grid grid-cards">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 140 }} />
        ))}
      </div>
    </main>
  );
}
