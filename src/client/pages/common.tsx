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
