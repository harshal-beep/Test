type BadgeStatus =
  | "success"
  | "failed"
  | "running"
  | "connected"
  | "disconnected"
  | "error";

const statusStyles: Record<BadgeStatus, string> = {
  success: "bg-emerald-100 text-emerald-700",
  connected: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  error: "bg-red-100 text-red-700",
  running: "text-amber-700",
  disconnected: "bg-gray-100 text-gray-600",
};

export default function StatusBadge({ status }: { status: BadgeStatus }) {
  return (
    <span
      className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded-full ${statusStyles[status]}`}
      style={
        status === "running"
          ? { backgroundColor: "#fffac0" }
          : undefined
      }
    >
      {status}
    </span>
  );
}
