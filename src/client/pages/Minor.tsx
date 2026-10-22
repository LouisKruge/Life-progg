import { BrainCircuit } from "lucide-react";
import { RoadmapPage } from "./common";

export const StrategistPage = () => (
  <RoadmapPage icon={BrainCircuit} phase={5} title="AI Strategist" summary="An optional Claude-powered strategist that only sees the data you approve and never changes anything without confirmation."
    features={["Daily planning and weekly reviews", "Goal breakdown", "Mission suggestions", "Privacy panel", "Works without AI in planner mode", "API key kept server-side"]} />
);
