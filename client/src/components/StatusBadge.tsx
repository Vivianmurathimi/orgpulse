const LABELS: Record<string, string> = {
  PENDING: "To do",
  DONE: "Done",
  OVERDUE: "Overdue",
  SKIPPED: "Skipped",
  PREDICTED: "Predicted",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status status-${status.toLowerCase()}`}>{LABELS[status] ?? status}</span>;
}
