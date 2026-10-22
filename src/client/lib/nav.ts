import {
  BrainCircuit,
  CalendarRange,
  Gift,
  History,
  Landmark,
  LayoutDashboard,
  Network,
  ScrollText,
  Settings,
  Trophy,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Development phase in which the full module ships; shown as a tag until then. */
  phase?: number;
}

export const NAV: NavItem[] = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/quests", label: "Quest Board", icon: ScrollText },
  { path: "/character", label: "Character", icon: UserRound },
  { path: "/skills", label: "Skill Trees", icon: Network },
  { path: "/wealth", label: "Wealth Center", icon: Landmark },
  { path: "/rewards", label: "Rewards Vault", icon: Gift },
  { path: "/achievements", label: "Achievements", icon: Trophy },
  { path: "/seasons", label: "Life Seasons", icon: CalendarRange },
  { path: "/strategist", label: "AI Strategist", icon: BrainCircuit, phase: 5 },
  { path: "/timeline", label: "Timeline", icon: History },
  { path: "/settings", label: "Settings", icon: Settings },
];
