import { useEffect } from "react";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { CheckCircle2, DatabaseBackup, Plus } from "lucide-react";
import { NAV } from "@/lib/nav";
import { navigate } from "@/lib/router";
import { openQuestEditor, paletteStore } from "@/lib/ui-state";
import { useCompleteQuest, useCreateBackup, useDashboard } from "@/lib/queries";

const itemClass =
  "flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm text-muted-foreground data-[selected=true]:bg-surface-2 data-[selected=true]:text-foreground";

export function CommandPalette() {
  const open = paletteStore.use();
  const { data } = useDashboard();
  const complete = useCompleteQuest();
  const backup = useCreateBackup();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        paletteStore.set(!paletteStore.get());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (fn: () => void) => {
    paletteStore.set(false);
    fn();
  };
  // Quests needing notes or confirmation open the board instead of completing blindly.
  const quickCompletable = (data?.quests ?? []).filter((q) => q.status === "pending" && q.quest.verification === "none");

  return (
    <D.Root open={open} onOpenChange={(o) => paletteStore.set(o)}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <D.Content className="fixed top-[18vh] left-1/2 z-50 w-[min(600px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl shadow-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search pages and actions</D.Description>
          <Command label="Command palette" loop>
            <Command.Input placeholder="Type a command or search..." className="h-12 w-full border-b border-border bg-transparent px-4 text-sm outline-none placeholder:text-subtle-foreground" />
            <Command.List className="max-h-[50vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">No results.</Command.Empty>
              <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                <Command.Item className={itemClass} onSelect={() => run(() => openQuestEditor())}>
                  <Plus className="size-4" /> New quest
                </Command.Item>
                <Command.Item className={itemClass} onSelect={() => run(() => backup.mutate())}>
                  <DatabaseBackup className="size-4" /> Create backup now
                </Command.Item>
              </Command.Group>
              {quickCompletable.length > 0 && (
                <Command.Group heading="Complete today's quests" className="[&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                  {quickCompletable.map((q) => (
                    <Command.Item key={q.instanceId} value={`complete ${q.quest.title}`} className={itemClass} onSelect={() => run(() => complete.mutate({ instanceId: q.instanceId }))}>
                      <CheckCircle2 className="size-4" /> {q.quest.title}
                      <span className="ml-auto text-xs text-subtle-foreground">+{q.quest.xpReward} XP</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                {NAV.map((n) => (
                  <Command.Item key={n.path} value={`go ${n.label}`} className={itemClass} onSelect={() => run(() => navigate(n.path))}>
                    <n.icon className="size-4" /> {n.label}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
