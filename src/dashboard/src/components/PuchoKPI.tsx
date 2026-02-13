interface PuchoKPIProps {
  label: string;
  value: string;
  trend?: "up" | "down";
}

export default function PuchoKPI({ label, value, trend }: PuchoKPIProps) {
  return (
    <div>
      <p className="font-body text-sm text-black/60">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="font-mono font-bold text-2xl text-pucho-violet">
          {value}
        </span>
        {trend && (
          <span
            className={`text-sm ${
              trend === "up" ? "text-green-500" : "text-red-500"
            }`}
          >
            {trend === "up" ? "\u2191" : "\u2193"}
          </span>
        )}
      </div>
    </div>
  );
}
