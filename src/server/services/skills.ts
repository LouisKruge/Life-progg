import { asc } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { skillNodes, skillProgress } from "../db/schema.js";
import type { SkillTreeView } from "../../shared/types.js";
import { computeMetrics, conditionMet, conditionProgress, describeCondition, type ConditionType, type Metrics } from "./metrics.js";
import { getSettings } from "./settings.js";
import { addTimelineEvent } from "./timeline.js";

interface NodeDef {
  key: string;
  name: string;
  description: string;
  parents: string[];
  type: ConditionType;
  value: number;
  ckey?: string;
  x: number;
  y: number;
}

interface TreeDef {
  key: string;
  name: string;
  description: string;
  nodes: NodeDef[];
}

/** Category-quest ladder used by most trees: four tiers plus an XP side branch. */
function ladder(cat: string, names: [string, string, string, string, string], blurbs: [string, string, string, string, string], xpBranch: number): NodeDef[] {
  const counts = [1, 10, 50, 150];
  const nodes: NodeDef[] = counts.map((n, i) => ({
    key: `${cat}_${i + 1}`,
    name: names[i]!,
    description: blurbs[i]!,
    parents: i === 0 ? [] : [`${cat}_${i}`],
    type: "category_quests",
    value: n,
    ckey: cat,
    x: 1,
    y: i,
  }));
  nodes.push({ key: `${cat}_xp`, name: names[4], description: blurbs[4], parents: [`${cat}_2`], type: "category_xp", value: xpBranch, ckey: cat, x: 2, y: 2 });
  return nodes;
}

/** Six trees grown from real accomplishments only. Positions are grid units for the node graph. */
export const SKILL_TREES: TreeDef[] = [
  {
    key: "wealth",
    name: "Wealth",
    description: "Saving, clearing debt and building financial freedom.",
    nodes: [
      { key: "wealth_tracker", name: "Tracker", description: "Complete a Wealth quest: looking at money is the first skill.", parents: [], type: "category_quests", value: 1, ckey: "wealth", x: 1, y: 0 },
      { key: "wealth_saver", name: "Saver", description: "R5,000 in protected savings.", parents: ["wealth_tracker"], type: "savings_total", value: 500_000, x: 0, y: 1 },
      { key: "wealth_buffer", name: "Buffer Builder", description: "R20,000 in protected savings.", parents: ["wealth_saver"], type: "savings_total", value: 2_000_000, x: 0, y: 2 },
      { key: "wealth_six_figures", name: "Six Figures", description: "R100,000 in protected savings.", parents: ["wealth_buffer"], type: "savings_total", value: 10_000_000, x: 0, y: 3 },
      { key: "wealth_debt_slayer", name: "Debt Slayer", description: "Pay off a debt in full.", parents: ["wealth_tracker"], type: "debts_paid_off", value: 1, x: 2, y: 1 },
      { key: "wealth_free", name: "Unchained", description: "Every tracked debt paid off.", parents: ["wealth_debt_slayer"], type: "debt_free", value: 1, x: 2, y: 2 },
      { key: "wealth_steward", name: "Steward", description: "Earn 3,000 Wealth XP from consistent money habits.", parents: ["wealth_tracker"], type: "category_xp", value: 3000, ckey: "wealth", x: 1, y: 2 },
    ],
  },
  {
    key: "physique",
    name: "Physique",
    description: "Strength, fitness, health and energy.",
    nodes: ladder("physique", ["Mover", "Regular", "Athlete", "Iron Will", "Endurance"], ["Complete a Physique quest.", "Ten Physique quests.", "Fifty Physique quests.", "One hundred and fifty Physique quests.", "Earn 3,000 Physique XP."], 3000),
  },
  {
    key: "mind",
    name: "Mind",
    description: "Learning, focus, reading and calm.",
    nodes: ladder("mind", ["Curious", "Learner", "Scholar", "Sage", "Deep Focus"], ["Complete a Mind quest.", "Ten Mind quests.", "Fifty Mind quests.", "One hundred and fifty Mind quests.", "Earn 3,000 Mind XP."], 3000),
  },
  {
    key: "empire",
    name: "Empire",
    description: "Career, business and building things.",
    nodes: ladder("empire", ["Starter", "Operator", "Founder", "Mogul", "Rainmaker"], ["Complete an Empire quest.", "Ten Empire quests.", "Fifty Empire quests.", "One hundred and fifty Empire quests.", "Earn 5,000 Empire XP."], 5000),
  },
  {
    key: "life",
    name: "Life",
    description: "Relationships, home, adventure and joy.",
    nodes: [
      ...ladder("life", ["Connector", "Host", "Explorer", "Rich Life", "Generous"], ["Complete a Life quest.", "Ten Life quests.", "Fifty Life quests.", "One hundred and fifty Life quests.", "Earn 3,000 Life XP."], 3000),
      { key: "life_enjoyer", name: "Enjoyer", description: "Redeem five real-life rewards. Rest and fun are part of the plan.", parents: ["life_1"], type: "rewards_redeemed", value: 5, x: 0, y: 1 },
    ],
  },
  {
    key: "discipline",
    name: "Discipline",
    description: "Consistency, routines and self-command.",
    nodes: [
      { key: "discipline_start", name: "First Step", description: "Complete any quest.", parents: [], type: "quests_completed", value: 1, x: 1, y: 0 },
      { key: "discipline_week", name: "Week Streak", description: "Quests on seven consecutive days.", parents: ["discipline_start"], type: "streak_days", value: 7, x: 0, y: 1 },
      { key: "discipline_month", name: "Month Streak", description: "Quests on thirty consecutive days.", parents: ["discipline_week"], type: "streak_days", value: 30, x: 0, y: 2 },
      { key: "discipline_unbreakable", name: "Unbreakable", description: "Quests on ninety consecutive days.", parents: ["discipline_month"], type: "streak_days", value: 90, x: 0, y: 3 },
      { key: "discipline_centurion", name: "Centurion", description: "One hundred quests completed.", parents: ["discipline_start"], type: "quests_completed", value: 100, x: 2, y: 1 },
      { key: "discipline_seasoned", name: "Seasoned", description: "Complete a ninety-day season.", parents: ["discipline_centurion"], type: "seasons_completed", value: 1, x: 2, y: 2 },
    ],
  },
];

export function seedSkills(ctx: AppContext): void {
  for (const tree of SKILL_TREES) {
    for (const n of tree.nodes) {
      const values = { tree: tree.key, key: n.key, name: n.name, description: n.description, parentKeys: n.parents, conditionType: n.type, conditionValue: n.value, conditionKey: n.ckey ?? null, x: n.x, y: n.y };
      ctx.store.db.insert(skillNodes).values(values).onConflictDoUpdate({ target: skillNodes.key, set: values }).run();
    }
  }
}

/**
 * Unlocks nodes whose parents are all unlocked and whose condition is met, repeating until
 * nothing changes so chains can cascade. Unlocks are permanent.
 */
export function evaluateSkills(ctx: AppContext, metrics: Metrics = computeMetrics(ctx)): string[] {
  const nodes = ctx.store.db.select().from(skillNodes).all();
  const unlockedIds = new Set(ctx.store.db.select({ id: skillProgress.nodeId }).from(skillProgress).all().map((r) => r.id));
  const unlockedKeys = new Set(nodes.filter((n) => unlockedIds.has(n.id)).map((n) => n.key));
  const out: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (unlockedKeys.has(n.key)) continue;
      if (!n.parentKeys.every((p) => unlockedKeys.has(p))) continue;
      if (!conditionMet(metrics, n.conditionType, n.conditionValue, n.conditionKey)) continue;
      ctx.store.db.insert(skillProgress).values({ nodeId: n.id, unlockedAt: ctx.clock.now().toISOString() }).onConflictDoNothing().run();
      addTimelineEvent(ctx, { type: "skill", title: `Skill unlocked: ${n.name}`, detail: n.description, sourceType: "skill", sourceId: n.id });
      unlockedKeys.add(n.key);
      out.push(n.key);
      changed = true;
    }
  }
  return out;
}

export function listSkillTrees(ctx: AppContext): SkillTreeView[] {
  const metrics = computeMetrics(ctx);
  const { currency, locale } = getSettings(ctx);
  const money = (c: number) => new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(c / 100);
  const progress = new Map(ctx.store.db.select().from(skillProgress).all().map((p) => [p.nodeId, p.unlockedAt]));
  const all = ctx.store.db.select().from(skillNodes).orderBy(asc(skillNodes.id)).all();
  const unlockedKeys = new Set(all.filter((n) => progress.has(n.id)).map((n) => n.key));
  return SKILL_TREES.map((t) => {
    const nodes = all
      .filter((n) => n.tree === t.key)
      .map((n) => {
        const unlockedAt = progress.get(n.id) ?? null;
        return {
          id: n.id,
          tree: n.tree,
          key: n.key,
          name: n.name,
          description: n.description,
          parentKeys: n.parentKeys,
          condition: describeCondition(n.conditionType, n.conditionValue, n.conditionKey, money),
          progress: unlockedAt ? 1 : conditionProgress(metrics, n.conditionType, n.conditionValue, n.conditionKey),
          x: n.x,
          y: n.y,
          unlockedAt,
          available: !unlockedAt && n.parentKeys.every((p) => unlockedKeys.has(p)),
        };
      });
    return { key: t.key, name: t.name, description: t.description, xp: metrics.categoryXp[t.key] ?? 0, unlocked: nodes.filter((n) => n.unlockedAt).length, total: nodes.length, nodes };
  });
}
