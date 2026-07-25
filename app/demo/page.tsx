import type { Metadata } from "next";
import {
  DEMO_TOKEN,
  demoFeedback,
  demoMessages,
  demoProject,
  demoRelease,
  demoTestItems,
  type ReviewPayload,
} from "../../lib/revaloop";
import { ReviewClient } from "../review/[token]/review-client";

export const metadata: Metadata = {
  title: "Démonstration client",
  description:
    "Découvrez le parcours client Revaloop avec des données entièrement fictives.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

const demoReview: ReviewPayload = {
  project: demoProject,
  release: demoRelease,
  feedback: demoFeedback,
  decisions: [],
  messages: demoMessages,
  testItems: demoTestItems,
  completedTestItemIds: [],
  reviewerName: "Client invité",
};

export default function DemoPage() {
  return (
    <ReviewClient
      token={DEMO_TOKEN}
      initialReview={demoReview}
      mode="demo"
    />
  );
}
