import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "warning";
  className?: string;
}) {
  const toneClass =
    tone === "positive"
      ? "text-success"
      : tone === "negative"
        ? "text-destructive"
        : tone === "warning"
          ? "text-warning"
          : "text-foreground";

  return (
    <div className={cn("panel p-4", className)}>
      <div className="label-xs">{label}</div>
      <div className={cn("num mt-1.5 text-xl font-semibold", toneClass)}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
