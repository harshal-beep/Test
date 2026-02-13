import type { ButtonHTMLAttributes } from "react";

interface PuchoButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export default function PuchoButton({
  variant = "primary",
  className = "",
  children,
  ...props
}: PuchoButtonProps) {
  const base =
    "px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 cursor-pointer";
  const variantClass =
    variant === "primary" ? "bg-pucho-violet" : "bg-violet-blossom";

  return (
    <button
      className={`${base} ${variantClass} ${className}`}
      style={{ borderRadius: "8px" }}
      {...props}
    >
      {children}
    </button>
  );
}
