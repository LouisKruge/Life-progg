import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, MoreHorizontal, Pencil, RotateCcw, SkipForward, Undo2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { QuestInstanceView } from "@shared/types";
import { useCompleteQuest, useSkipQuest, useUndoQuest } from "@/lib/queries";
import { openQuestEditor } from "@/lib/ui-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DIFFICULTY_PIPS, FREQUENCY_LABEL, KIND_LABEL } from "./meta";

export function DifficultyPips({ level }: { level: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn("h-2.5 w-1 rounded-sm", i <= level ? "bg-accent" : "bg-surface-3")} />
      ))}
    </span>
  );
}

const menuItem = "flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-sm text-muted-foreground outline-none data-[highlighted]:bg-surface-3 data-[highlighted]:text-foreground";

/** One quest instance with complete / undo / skip actions and a completion effect. */
export function QuestRow({ item, categoryName }: { item: QuestInstanceView; categoryName?: string }) {
  const complete = useCompleteQuest();
  const undo = useUndoQuest();
  const skip = useSkipQuest();
  const [noteOpen, setNoteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [note, setNote] = useState("");
  const [burst, setBurst] = useState(0);

  const { quest, status } = item;
  const done = status === "completed";
  const skipped = status === "skipped";
  const busy = complete.isPending || undo.isPending;
  const canUndo = done && item.completion && new Date(item.completion.undoableUntil).getTime() > Date.now();

  const doComplete = (extra: { evidenceNote?: string; confirmed?: boolean } = {}) =>
    complete.mutate({ instanceId: item.instanceId, ...extra }, { onSuccess: (r) => !r.alreadyCompleted && setBurst((b) => b + 1) });

  const onCheck = () => {
    if (busy) return;
    if (done) return canUndo ? setUndoOpen(true) : undefined;
    if (quest.verification === "note") return setNoteOpen(true);
    if (quest.verification === "confirm") return setConfirmOpen(true);
    doComplete();
  };

  return (
    <motion.li layout className={cn("group relative flex items-center gap-4 rounded-lg border border-transparent px-3 py-3 transition-colors hover:border-border hover:bg-surface-2/60", skipped && "opacity-50")}>
      <button
        onClick={onCheck}
        disabled={busy || skipped || (done && !canUndo)}
        aria-label={done ? `Undo ${quest.title}` : `Complete ${quest.title}`}
        aria-pressed={done}
        className={cn(
          "relative grid size-6 shrink-0 place-items-center rounded-md border transition-all duration-200",
          done ? "border-foreground bg-foreground text-background" : "border-[#4a4d55] hover:border-accent hover:bg-surface-3",
          "disabled:cursor-default",
        )}
      >
        <AnimatePresence>
          {done && (
            <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}>
              <Check className="size-4" strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {burst > 0 && (
            <motion.span
              key={burst}
              className="pointer-events-none absolute inset-0 rounded-md border-2 border-foreground"
              initial={{ scale: 1, opacity: 0.8 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-sm font-medium transition-colors", done && "text-muted-foreground line-through decoration-subtle-foreground")}>{quest.title}</span>
          {quest.isOptional && <Badge variant="outline">Optional</Badge>}
          {quest.kind !== "standard" && <Badge>{KIND_LABEL[quest.kind]}</Badge>}
          {quest.isDemo && <Badge variant="outline">Demo</Badge>}
          {skipped && <Badge>Skipped</Badge>}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-subtle-foreground">
          <DifficultyPips level={DIFFICULTY_PIPS[quest.difficulty]} />
          <span>{FREQUENCY_LABEL[quest.frequency]}</span>
          {categoryName && <span>{categoryName}</span>}
          {quest.dueDate && <span>Due {quest.dueDate}</span>}
          {item.completion?.evidenceNote && <span className="truncate italic">“{item.completion.evidenceNote}”</span>}
        </div>
      </div>

      <div className="relative text-right text-xs tabular-nums">
        <div className={cn("font-medium", done ? "text-muted-foreground" : "text-foreground")}>+{quest.xpReward} XP</div>
        <div className="text-subtle-foreground">+{quest.creditReward} cr</div>
        <AnimatePresence>
          {burst > 0 && (
            <motion.div
              key={burst}
              className="pointer-events-none absolute -top-2 right-0 text-sm font-semibold text-foreground"
              initial={{ y: 0, opacity: 1 }}
              animate={{ y: -28, opacity: 0 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            >
              +{quest.xpReward} XP
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${quest.title}`} className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100">
            <MoreHorizontal />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-lg border border-border bg-surface-2 p-1 shadow-xl shadow-black/50">
            {canUndo && (
              <DropdownMenu.Item className={menuItem} onSelect={() => setUndoOpen(true)}>
                <Undo2 className="size-3.5" /> Undo completion
              </DropdownMenu.Item>
            )}
            {!done && !skipped && (
              <DropdownMenu.Item className={menuItem} onSelect={() => skip.mutate({ instanceId: item.instanceId, skipped: true })}>
                <SkipForward className="size-3.5" /> Skip (no penalty)
              </DropdownMenu.Item>
            )}
            {skipped && (
              <DropdownMenu.Item className={menuItem} onSelect={() => skip.mutate({ instanceId: item.instanceId, skipped: false })}>
                <RotateCcw className="size-3.5" /> Restore
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item className={menuItem} onSelect={() => openQuestEditor(quest)}>
              <Pencil className="size-3.5" /> Edit quest
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent title={`Complete “${quest.title}”`} description="This quest asks for a short note about what you did.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doComplete({ evidenceNote: note });
              setNoteOpen(false);
              setNote("");
            }}
            className="space-y-4"
          >
            <Field label="What did you do?" htmlFor={`note-${item.instanceId}`}>
              <Textarea id={`note-${item.instanceId}`} autoFocus required maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setNoteOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!note.trim()}>Complete</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Confirm “${quest.title}”`}
        description={quest.completionRequirements ? `Done when: ${quest.completionRequirements}` : "Confirm this milestone has actually been achieved."}
        confirmLabel="Yes, it's done"
        onConfirm={() => doComplete({ confirmed: true })}
      />
      <ConfirmDialog
        open={undoOpen}
        onOpenChange={setUndoOpen}
        title="Undo this completion?"
        description={`This removes the ${item.completion?.xpAwarded ?? 0} XP and ${item.completion?.creditsAwarded ?? 0} credits it earned. The reversal is recorded in your history.`}
        confirmLabel="Undo"
        onConfirm={() => undo.mutate(item.instanceId)}
      />
    </motion.li>
  );
}
