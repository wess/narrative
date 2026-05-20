// Lightweight date formatting — the webview is a browser, so `Intl` is free.

const parse = (iso: string): Date | null => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDate = (iso: string): string => {
  const d = parse(iso);
  if (!d) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export const formatDateTime = (iso: string): string => {
  const d = parse(iso);
  if (!d) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const relativeTime = (iso: string): string => {
  const d = parse(iso);
  if (!d) return iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
};

export const todayIso = (): string => new Date().toISOString().slice(0, 10);
