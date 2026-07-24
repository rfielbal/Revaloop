import type { Metadata } from "next";
import { ReviewClient } from "./review-client";
import {
  demoFeedback,
  demoProject,
  demoRelease,
  type ReviewPayload,
} from "../../../lib/revaloop";

export const metadata: Metadata = {
  title: "Version de test · Maison Matisse",
  description:
    "Espace privé de recette client pour la version v1.2 de Maison Matisse.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

const initialReview: ReviewPayload = {
  project: demoProject,
  release: demoRelease,
  feedback: demoFeedback,
  decisions: [],
};

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ReviewClient token={token} initialReview={initialReview} />;
}
