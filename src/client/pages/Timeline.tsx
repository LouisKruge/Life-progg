import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Camera, History, Plus, Trash2 } from "lucide-react";
import type { TimelineItem } from "@shared/types";
import { useAddNote, useDeleteNote, useSnapshot, useTimelineFeed, type TimelineFilter } from "@/lib/queries-progress";
import { useCategories, useSettings } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader, QueryError } from "./common";

const TYPE_LABEL: Record<string, string> = {
  quest_completed: "Quests",
  level_up: "Level-ups",
  achievement: "Achievements",
  skill: "Skills",
  savings_milestone: "Savings",
  debt_paid_off: "Debt",
  reward_redeemed: "Rewards",
  season_started: "Seasons",
  season_completed: "Seasons",
  season_goal: "Seasons",
  note: "Notes",
  life_event: "Life events",
  snapshot: "Snapshots",
  journey_started: "Milestones",
};

type Grouping = "week" | "month" | "year";
type Range = "all" | "week" | "month" | "year";

function rangeStart(range: Range): string | null {
  if (range === "all") return null;
  const d = new Date();
  if (range === "week") d.setDate(d.getDate() - 7);
  if (range === "month") d.setMonth(d.getMonth() - 1);
  if (range === "year") d.setFullYear(d.getFullYear() - 1);
  return d.toISOString();
}

function groupKey(iso: string, g: Grouping, timeZone: string, locale: string): string {
  const d = new Date(iso);
  if (g === "year") return new Intl.DateTimeFormat(locale, { year: "numeric", timeZone }).format(d);
  if (g === "month") return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone }).format(d);
  // Week: label by the Monday it starts on.
  const local = new Date(new Intl.DateTimeFormat("en-CA", { timeZone }).format(d) + "T12:00:00Z");
  const day = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() - day + 1);
  return `Week of ${new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(local)}`;
}

export function TimelinePage() {
  const { data: settings } = useSettings();
  const { data: categories } = useCategories();
  const [typeGroups, setTypeGroups] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [range, setRange] = useState<Range>("all");
  const [grouping, setGrouping] = useState<Grouping>("month");
  const [noteOpen, setNoteOpen] = useState(false);
  const snapshot = useSnapshot();
  const del = useDeleteNote();

  const typesForGroups = (groups: string[]) => Object.entries(TYPE_LABEL).filter(([, l]) => groups.includes(l)).map(([t]) => t);
  const filter: TimelineFilter = useMemo(() => ({ types: typesForGroups(typeGroups), categoryId, from: rangeStart(range), to: null }), [typeGroups, categoryId, range]);
  const { data, error, refetch } = useTimelineFeed(filter);
  const tz = settings?.timezone ?? "Africa/Johannesburg";
  const locale = settings?.locale ?? "en-ZA";

  const groups = useMemo(() => {
    const out = new Map<string, TimelineItem[]>();
    for (const item of data?.items ?? []) {
      const k = groupKey(item.occurredAt, grouping, tz, locale);
      out.set(k, [...(out.get(k) ?? []), item]);
    }
    return [...out.entries()];
  }, [data, grouping, tz, locale]);

  if (error) return <QueryError error={error} retry={refetch} />;
  const availableGroups = [...new Set((data?.types ?? []).map((t) => TYPE_LABEL[t] ?? t))];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Timeline"
        title="Evidence of progress"
        description="Everything meaningful, in order: quests, level-ups, milestones, seasons, and the notes you add yourself."
        actions={
          <>
            <Button variant="secondary" onClick={() => snapshot.mutate()} disabled={snapshot.isPending}><Camera /> Snapshot</Button>
            <Button onClick={() => setNoteOpen(true)}><Plus /> Note</Button>
          </>
        }
      />
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
            {availableGroups.map((g) => {
              const on = typeGroups.includes(g);
              return (
                <button key={g} aria-pressed={on} onClick={() => setTypeGroups(on ? typeGroups.filter((x) => x !== g) : [...typeGroups, g])} className={cn("rounded-full border px-3 py-1 text-xs", on ? "border-accent bg-accent text-background" : "border-border text-muted-foreground hover:text-foreground")}>
                  {g}
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NativeSelect aria-label="Category" value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)} className="w-36">
              <option value="">All categories</option>
              {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
            <NativeSelect aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value as Range)} className="w-36">
              <option value="all">All time</option>
              <option value="week">Past week</option>
              <option value="month">Past month</option>
              <option value="year">Past year</option>
            </NativeSelect>
            <div className="flex rounded-md border border-border p-0.5 text-xs" role="tablist" aria-label="Group by">
              {(["week", "month", "year"] as const).map((g) => (
                <button key={g} role="tab" aria-selected={grouping === g} onClick={() => setGrouping(g)} className={cn("rounded px-3 py-1.5 capitalize", grouping === g ? "bg-surface-3 text-foreground" : "text-muted-foreground")}>{g}ly</button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {!data ? <Skeleton className="h-96" /> : data.items.length === 0 ? (
        <EmptyState icon={History} title="Nothing here yet">{typeGroups.length || categoryId || range !== "all" ? "No events match these filters." : "Completed quests, level-ups and milestones will appear here."}</EmptyState>
      ) : (
        <div className="space-y-8">
          <p className="text-xs text-subtle-foreground">{data.items.length} of {data.total} events</p>
          {groups.map(([label, items]) => (
            <section key={label} aria-label={label}>
              <h2 className="text-label mb-3 flex items-center gap-3">{label}<span className="text-subtle-foreground normal-case tracking-normal">{items.length} event{items.length > 1 ? "s" : ""}</span></h2>
              <ol className="relative ml-3 border-l border-border">
                {items.map((e, i) => (
                  <motion.li key={e.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.015, 0.2) }} className="group relative pb-5 pl-6">
                    <span className={cn("absolute top-1.5 -left-[5px] size-2.5 rounded-full border border-background", ["achievement", "level_up", "season_completed", "savings_milestone", "debt_paid_off"].includes(e.type) ? "bg-foreground ring-2 ring-accent/30" : "bg-subtle-foreground")} />
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-subtle-foreground">{formatDateTime(e.occurredAt, locale, tz)} · {TYPE_LABEL[e.type] ?? e.type}</div>
                        <div className="mt-0.5 text-sm font-medium">{e.title}</div>
                        {e.detail && <div className="text-xs whitespace-pre-line text-muted-foreground">{e.detail}</div>}
                      </div>
                      {(e.type === "note" || e.type === "life_event") && (
                        <Button size="icon-sm" variant="ghost" aria-label={`Delete note ${e.title}`} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => del.mutate(e.id)}><Trash2 /></Button>
                      )}
                    </div>
                  </motion.li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      <NoteDialog open={noteOpen} onOpenChange={setNoteOpen} />
    </div>
  );
}

function NoteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const add = useAddNote();
  const [f, setF] = useState({ title: "", detail: "", kind: "note" as "note" | "event" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add to your timeline" description="A personal note, or a significant life event worth remembering.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (f.title.trim()) add.mutate({ title: f.title.trim(), detail: f.detail.trim() || undefined, kind: f.kind }, { onSuccess: () => { onOpenChange(false); setF({ title: "", detail: "", kind: "note" }); } }); }}>
          <Field label="Type" htmlFor="nt-kind"><NativeSelect id="nt-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "note" | "event" })}><option value="note">Note</option><option value="event">Significant life event</option></NativeSelect></Field>
          <Field label="Title" htmlFor="nt-title"><Input id="nt-title" autoFocus maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Signed the lease on the new flat" /></Field>
          <Field label="Details (optional)" htmlFor="nt-detail"><Textarea id="nt-detail" maxLength={4000} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!f.title.trim() || add.isPending}>Add</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
