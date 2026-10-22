import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, CalendarClock, Pencil, Plus, ScrollText } from "lucide-react";
import type { Quest } from "@shared/types";
import { useArchiveQuest, useCategories, useQuestBoard, useQuests, useRescheduleQuest, useSettings } from "@/lib/queries";
import { openQuestEditor } from "@/lib/ui-state";
import { formatDate, WEEKDAYS } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { QuestRow, DifficultyPips } from "@/components/quests/QuestRow";
import { DIFFICULTY_PIPS, FREQUENCY_LABEL, KIND_LABEL } from "@/components/quests/meta";
import { PageHeader, QueryError } from "./common";
import { cn } from "@/lib/utils";

export function QuestBoardPage() {
  const board = useQuestBoard();
  const [showArchived, setShowArchived] = useState(false);
  const quests = useQuests(showArchived);
  const { data: categories } = useCategories();
  const { data: settings } = useSettings();
  const catName = useMemo(() => new Map(categories?.map((c) => [c.id, c.name])), [categories]);

  if (board.error) return <QueryError error={board.error} retry={board.refetch} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Quest engine"
        title="Quest Board"
        description="Completions pay out once per day, week or quest. Skipping is always penalty-free."
        actions={<Button onClick={() => openQuestEditor()}><Plus /> New quest</Button>}
      />

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-7">
          <CardHeader><CardTitle>Active now</CardTitle><span className="text-xs text-muted-foreground">{board.data && formatDate(board.data.date, settings?.locale)}</span></CardHeader>
          <CardContent className="pt-3">
            {!board.data ? (
              <Skeleton className="h-40" />
            ) : board.data.today.length === 0 ? (
              <EmptyState icon={ScrollText} title="Nothing on the board today">Create a quest, or enjoy the space.</EmptyState>
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {board.data.today.map((q) => <QuestRow key={q.instanceId} item={q} categoryName={q.quest.categoryId ? catName.get(q.quest.categoryId) : undefined} />)}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="col-span-12 xl:col-span-5">
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="size-3.5" /> Upcoming</CardTitle></CardHeader>
          <CardContent className="pt-3">
            {!board.data ? (
              <Skeleton className="h-24" />
            ) : board.data.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one-time quests scheduled for later.</p>
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {board.data.upcoming.map((q) => <QuestRow key={q.instanceId} item={q} categoryName={q.quest.categoryId ? catName.get(q.quest.categoryId) : undefined} />)}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All quests</CardTitle>
          <div className="flex rounded-md border border-border p-0.5 text-xs" role="tablist" aria-label="Quest filter">
            {[false, true].map((a) => (
              <button key={String(a)} role="tab" aria-selected={showArchived === a} onClick={() => setShowArchived(a)} className={cn("rounded px-3 py-1", showArchived === a ? "bg-surface-3 text-foreground" : "text-muted-foreground")}>
                {a ? "Including archived" : "Active"}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          {quests.error ? (
            <QueryError error={quests.error} retry={quests.refetch} />
          ) : !quests.data ? (
            <Skeleton className="h-40" />
          ) : quests.data.length === 0 ? (
            <EmptyState icon={ScrollText} title="No quests yet" action={<Button size="sm" onClick={() => openQuestEditor()}><Plus /> New quest</Button>}>
              Quests can repeat daily, weekly, on chosen weekdays, or happen once.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-label border-b border-border text-left">
                    <th className="py-2 pr-4 font-medium">Quest</th>
                    <th className="py-2 pr-4 font-medium">Schedule</th>
                    <th className="py-2 pr-4 font-medium">Category</th>
                    <th className="py-2 pr-4 font-medium">Difficulty</th>
                    <th className="py-2 pr-4 text-right font-medium">Reward</th>
                    <th className="py-2 font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {quests.data.map((q) => <QuestTableRow key={q.id} quest={q} category={q.categoryId ? catName.get(q.categoryId) : undefined} />)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function schedule(q: Quest) {
  if (q.frequency === "custom") return q.recurrenceDays.map((d) => WEEKDAYS[d]).join(", ");
  if (q.frequency === "once") return q.dueDate ? `Once · due ${q.dueDate}` : "Once";
  return FREQUENCY_LABEL[q.frequency];
}

function QuestTableRow({ quest, category }: { quest: Quest; category?: string }) {
  const archive = useArchiveQuest();
  const reschedule = useRescheduleQuest();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [date, setDate] = useState(quest.dueDate ?? "");
  const archived = quest.status === "archived";
  return (
    <tr className={cn("border-b border-border/60 last:border-0", archived && "opacity-50")}>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">{quest.title}</span>
          {quest.kind !== "standard" && <Badge>{KIND_LABEL[quest.kind]}</Badge>}
          {quest.isOptional && <Badge variant="outline">Optional</Badge>}
          {quest.isDemo && <Badge variant="outline">Demo</Badge>}
          {archived && <Badge>Archived</Badge>}
        </div>
        {quest.description && <div className="mt-0.5 max-w-md truncate text-xs text-subtle-foreground">{quest.description}</div>}
      </td>
      <td className="py-3 pr-4 text-muted-foreground">{schedule(quest)}</td>
      <td className="py-3 pr-4 text-muted-foreground">{category ?? "—"}</td>
      <td className="py-3 pr-4"><DifficultyPips level={DIFFICULTY_PIPS[quest.difficulty]} /></td>
      <td className="py-3 pr-4 text-right text-xs tabular-nums text-muted-foreground">{quest.xpReward} XP · {quest.creditReward} cr</td>
      <td className="py-3">
        <div className="flex justify-end gap-1">
          {quest.frequency === "once" && !archived && (
            <Button variant="ghost" size="icon-sm" aria-label={`Reschedule ${quest.title}`} onClick={() => setRescheduleOpen(true)}><CalendarClock /></Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${quest.title}`} onClick={() => openQuestEditor(quest)}><Pencil /></Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={archived ? `Restore ${quest.title}` : `Archive ${quest.title}`}
            onClick={() => (archived ? archive.mutate({ id: quest.id, archived: false }) : setConfirmArchive(true))}
          >
            {archived ? <ArchiveRestore /> : <Archive />}
          </Button>
        </div>
        <ConfirmDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title={`Archive “${quest.title}”?`}
          description="It leaves the board. All XP and credits it earned stay, and you can restore it any time."
          confirmLabel="Archive"
          onConfirm={() => archive.mutate({ id: quest.id, archived: true })}
        />
        <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
          <DialogContent title="Reschedule quest" description={quest.title} className="w-[min(400px,calc(100vw-2rem))]">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (date) reschedule.mutate({ id: quest.id, dueDate: date }, { onSuccess: () => setRescheduleOpen(false) });
              }}
            >
              <Field label="New due date" htmlFor={`rs-${quest.id}`}>
                <Input id={`rs-${quest.id}`} type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="[color-scheme:dark]" />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={!date}>Reschedule</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </td>
    </tr>
  );
}
