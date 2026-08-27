export function FetchFailedState({ message }: { message?: string }) {
  return (
    <div className="state-box error">
      <div className="state-box-title">Couldn't load data</div>
      <p>{message ?? "The request failed. Check that the dev server is running and try refreshing."}</p>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="state-box">
      <div className="state-box-title">{title}</div>
      {hint && <p>{hint}</p>}
    </div>
  );
}
