import type { ReactNode } from "react";

export default function PuchoCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white p-4 ${className}`}
      style={{
        borderRadius: "12px",
        boxShadow: "0 1px 3px rgba(89,34,198,0.08)",
      }}
    >
      {children}
    </div>
  );
}
