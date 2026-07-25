import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getReviewForReviewer } from "../../../db/repository";
import { reviewCookieName } from "../../../lib/security";
import { ReviewClient } from "./review-client";
import { ReviewUnavailable } from "./review-unavailable";

export const dynamic = "force-dynamic";

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

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: releaseId } = await params;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(reviewCookieName(releaseId))?.value;

  if (!sessionToken) {
    return (
      <ReviewUnavailable
        title="Cette session n’est pas reconnue"
        message="Ouvrez le lien d’invitation reçu ou demandez au développeur de créer un nouvel accès."
      />
    );
  }

  let review: Awaited<ReturnType<typeof getReviewForReviewer>> = null;
  let unavailable = false;

  try {
    review = await getReviewForReviewer(releaseId, sessionToken);
  } catch {
    unavailable = true;
  }

  if (unavailable) {
    return (
      <ReviewUnavailable
        title="L’espace de test est momentanément indisponible"
        message="Réessayez dans quelques instants ou contactez le développeur."
        retryHref={`/review/${encodeURIComponent(releaseId)}`}
      />
    );
  }

  if (!review) {
    return (
      <ReviewUnavailable
        title="Cet accès n’est plus disponible"
        message="La session a expiré ou a été révoquée. Demandez un nouveau lien au développeur."
      />
    );
  }

  return (
    <ReviewClient
      token={releaseId}
      initialReview={review}
      mode="live"
    />
  );
}
