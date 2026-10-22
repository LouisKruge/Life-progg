import { BrainCircuit, CalendarRange, History, Network, Trophy } from "lucide-react";
import { useSettings, useTimeline } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, QueryError, RoadmapPage } from "./common";

export function TimelinePage() {
  const { data, error, refetch } = useTimeline();
  const { data: settings } = useSettings();
  if (error) return <QueryError error={error} retry={refetch} />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Timeline" title="Your history" description="The 50 most recent events. Filters and weekly, monthly and yearly views arrive in phase 4." />
      {!data ? (
        <Skeleton className="h-60" />
      ) : data.length === 0 ? (
        <EmptyState icon={History} title="Nothing here yet">Completed quests, level-ups and milestones will appear here.</EmptyState>
      ) : (
        <ol className="relative ml-3 border-l border-border">
          {data.map((e) => (
            <li key={e.id} className="relative pb-6 pl-6">
              <span className="absolute top-1.5 -left-[5px] size-2.5 rounded-full border border-background bg-accent" />
              <div className="text-xs text-subtle-foreground">{formatDateTime(e.occurredAt, settings?.locale, settings?.timezone)}</div>
              <div className="mt-0.5 text-sm font-medium">{e.title}</div>
              {e.detail && <div className="text-xs text-muted-foreground">{e.detail}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export const SkillTreesPage = () => (
  <RoadmapPage icon={Network} phase={4} title="Skill Trees" summary="Six trees - Wealth, Physique, Mind, Empire, Life and Discipline - that grow from real accomplishments."
    features={["Node graph with zoom and pan", "Accessible list view", "Dependencies and unlock conditions", "Skill-specific XP from category quests", "Expandable node descriptions", "Milestone achievements"]} />
);
export const AchievementsPage = () => (
  <RoadmapPage icon={Trophy} phase={4} title="Achievement Vault" summary="Permanent achievements with explicit, testable unlock conditions."
    features={["First R20,000 saved", "R100,000 savings", "Thirty consistent days", "Debt-free milestone", "Tiers and rarity", "Optional evidence"]} />
);
export const SeasonsPage = () => (
  <RoadmapPage icon={CalendarRange} phase={4} title="Life Seasons" summary="Ninety-day seasons with three primary objectives. Seasons never reset lifetime XP, credits or records."
    features={["Season objectives and milestones", "Weekly reviews", "Progress charts", "End-of-season summary", "Personal celebration", "Archive in the timeline"]} />
);
export const StrategistPage = () => (
  <RoadmapPage icon={BrainCircuit} phase={5} title="AI Strategist" summary="An optional Claude-powered strategist that only sees the data you approve and never changes anything without confirmation."
    features={["Daily planning and weekly reviews", "Goal breakdown", "Mission suggestions", "Privacy panel", "Works without AI in planner mode", "API key kept server-side"]} />
);
