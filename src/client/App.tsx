import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useSettings } from "@/lib/queries";
import { usePath } from "@/lib/router";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { Toaster } from "@/components/layout/Toaster";
import { LevelUpOverlay } from "@/components/layout/LevelUpOverlay";
import { QuestEditor } from "@/components/quests/QuestEditor";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { lazy, Suspense } from "react";
import { DashboardPage } from "@/pages/Dashboard";
import { OnboardingPage } from "@/pages/Onboarding";
import { UnlockCelebration } from "@/components/layout/UnlockCelebration";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/pages/common";

// The dashboard loads eagerly; every other page is its own chunk, fetched on first visit.
const page = <K extends string>(load: () => Promise<Record<K, () => React.ReactElement>>, name: K) => lazy(async () => ({ default: (await load())[name] }));

const ROUTES: Record<string, React.ComponentType> = {
  "/": DashboardPage,
  "/quests": page(() => import("@/pages/QuestBoard"), "QuestBoardPage"),
  "/character": page(() => import("@/pages/Character"), "CharacterPage"),
  "/skills": page(() => import("@/pages/SkillTrees"), "SkillTreesPage"),
  "/wealth": page(() => import("@/pages/WealthCenter"), "WealthCenterPage"),
  "/rewards": page(() => import("@/pages/RewardsVault"), "RewardsVaultPage"),
  "/achievements": page(() => import("@/pages/Achievements"), "AchievementsPage"),
  "/seasons": page(() => import("@/pages/Seasons"), "SeasonsPage"),
  "/strategist": page(() => import("@/pages/Strategist"), "StrategistPage"),
  "/timeline": page(() => import("@/pages/Timeline"), "TimelinePage"),
  "/settings": page(() => import("@/pages/Settings"), "SettingsPage"),
};

export function App() {
  const { data: settings, error, refetch, isLoading } = useSettings();
  const path = usePath();
  const motionPref = settings?.reducedMotion === "reduce" ? "always" : settings?.reducedMotion === "full" ? "never" : "user";

  if (error) return <QueryError error={error} retry={refetch} />;
  if (isLoading || !settings) return <div className="grid h-full place-items-center text-sm text-muted-foreground" aria-busy="true">Loading LEVEL ONE...</div>;

  return (
    <MotionConfig reducedMotion={motionPref}>
      {!settings.onboarded ? (
        <OnboardingPage />
      ) : (
        <div className="flex h-full">
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-foreground focus:px-3 focus:py-2 focus:text-background">Skip to content</a>
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main id="main" className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={path}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="mx-auto max-w-[1600px] px-8 py-8"
                >
                  <ErrorBoundary key={path}>
                    <Page path={path} />
                  </ErrorBoundary>
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
          <QuestEditor />
          <CommandPalette />
          <LevelUpOverlay />
          <UnlockCelebration />
        </div>
      )}
      <Toaster />
    </MotionConfig>
  );
}

function Page({ path }: { path: string }) {
  const Component = ROUTES[path];
  if (!Component) return <QueryError error={new Error(`No page at ${path}.`)} />;
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Component />
    </Suspense>
  );
}
