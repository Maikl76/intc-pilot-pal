import type { ReactNode } from "react";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Dlaždice s hodnotou a vysvětlením. */
export function Figure({
  label,
  value,
  detail,
  color = "",
}: {
  label: string;
  value: string;
  detail: ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/35 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={"num mt-2 text-2xl font-semibold " + color}>{value}</p>
      <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

const NOTE_STYLE = {
  good: ["border-success/40 bg-success/5", "text-success"],
  warn: ["border-warning/40 bg-warning/5", "text-warning"],
  bad: ["border-destructive/40 bg-destructive/5", "text-destructive"],
  info: ["border-primary/30 bg-primary/5", "text-primary"],
} as const;

/** Poznámka s ikonou: dobrá zpráva, varování, problém nebo informace. */
export function Note({
  kind,
  title,
  children,
}: {
  kind: keyof typeof NOTE_STYLE;
  title: string;
  children: ReactNode;
}) {
  const [box, icon] = NOTE_STYLE[kind];
  const Icon = kind === "good" ? CircleCheck : kind === "info" ? Info : TriangleAlert;
  return (
    <div className={"flex gap-3 rounded-xl border p-4 text-sm " + box}>
      <Icon className={"mt-0.5 size-5 shrink-0 " + icon} />
      <div>
        <p className="font-semibold">{title}</p>
        <div className="mt-1 space-y-2 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

/** Karta oddílu se záhlavím a úvodním textem. */
export function Section({
  icon,
  eyebrow,
  title,
  intro,
  children,
  id,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  intro: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <Card id={id} className="overflow-hidden rounded-2xl">
      <div className="border-b border-border bg-primary/5 p-5 sm:p-6">
        <p className="eyebrow">{eyebrow}</p>
        <div className="mt-1 flex items-center gap-3">
          {icon}
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
        <div className="mt-2 max-w-4xl text-sm text-muted-foreground">{intro}</div>
      </div>
      <div className="space-y-6 p-5 sm:p-6">{children}</div>
    </Card>
  );
}
