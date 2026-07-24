import type { Metadata } from "next";
import { DashboardClient } from "./dashboard-client";
import {
  demoFeedback,
  demoProject,
  demoRelease,
  type ReviewPayload,
} from "../../lib/revaloop";

export const metadata: Metadata = {
  title: "Espace développeur",
  description:
    "Suivez une version en recette, traitez les retours et préparez sa validation.",
};

const initialWorkspace: ReviewPayload = {
  project: demoProject,
  release: demoRelease,
  feedback: demoFeedback,
  decisions: [],
};

export default function DashboardPage() {
  return <DashboardClient initialWorkspace={initialWorkspace} />;
}
