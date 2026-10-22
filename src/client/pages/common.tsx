import type { LucideIcon } from "lucide-react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div>
        {eyebrow && <div className="text-label mb-2">{eyebrow}</div>}
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function QueryError({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-20 max-w-md rounded-xl border border-border bg-surface p-8 text-center">
      <TriangleAlert className="mx-auto size-6 text-danger" />
      <h2 className="mt-3 font-medium">Couldn't load this view</h2>
      <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
      {retry && <Button variant="secondary" className="mt-5" onClick={retry}>Try again</Button>}
    </div>
  );
}

/** Honest placeholder for modules scheduled in a later phase. It has no buttons that pretend to work. */
export function RoadmapPage({ icon: Icon, title, phase, summary, features }: { icon: LucideIcon; title: string; phase: number; summary: string; features: string[] }) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Planned · Phase ${phase}`} title={title} description={summary} />
      <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8">
        <div className="flex items-start gap-5">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-surface-2">
            <Icon className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              This module isn't built yet. Nothing on this page is interactive, and nothing here affects your data. It's planned to include:
            </p>
            <ul className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              {features.map((f) => (
                <li key={f} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-subtle-foreground" />{f}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
