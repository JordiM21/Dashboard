export const ago = (iso?: string) => {
  if (!iso) return "No activity yet";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "Just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
