import type { Metadata } from "next";
import { ReviewClient } from "./review-client";
import { ReviewUnavailable } from "./review-unavailable";
import {
  DEMO_TOKEN,
  demoFeedback,
  demoProject,
  demoRelease,
  type ReviewPayload,
} from "../../../lib/revaloop";

export const metadata: Metadata = {
  title: "Espace de test privé",
  description: "Consultez une version de test qui vous a été partagée.",
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

  if (token !== DEMO_TOKEN) {
    return (
      <ReviewUnavailable
        title="Ce lien n’est pas valide"
        message="Vérifiez le lien reçu ou demandez au développeur de vous renvoyer un accès."
      />
    );
  }

  // The current wall clock is intentionally read here: expiry is a
  // request-time access guard in this server component.
  // eslint-disable-next-line react-hooks/purity
  if (new Date(demoRelease.expiresAt).getTime() <= Date.now()) {
    return (
      <ReviewUnavailable
        title="Ce lien a expiré"
        message="Cette version de test n’est plus accessible. Demandez un nouveau lien au développeur."
      />
    );
  }

  return <ReviewClient token={token} initialReview={initialReview} />;
}
