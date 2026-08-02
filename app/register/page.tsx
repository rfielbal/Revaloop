import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth/auth-form";
import { getRecoverableLocalDeveloperPlaceholderEmail } from "../../db/repository";
import {
  canonicalRequestHostname,
  developerRegistrationIsOpen,
  developerRegistrationRequestIsAuthorized,
  getDeveloperIdentity,
  isLoopbackRequestHostname,
  safeAuthReturnPath,
  sitesAuthenticatedEmailFromHeaders,
} from "../../lib/developer-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Initialiser l’instance",
  description: "Créez le premier compte développeur de votre instance Revaloop.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>;
}) {
  const { return_to: requestedReturnPath } = await searchParams;
  const returnTo = safeAuthReturnPath(requestedReturnPath);
  const [identity, requestHeaders] = await Promise.all([
    getDeveloperIdentity(),
    headers(),
  ]);

  if (identity) {
    redirect(returnTo);
  }

  const registrationOpen = await developerRegistrationIsOpen();
  const registrationAuthorized =
    registrationOpen &&
    (await developerRegistrationRequestIsAuthorized(requestHeaders));
  const hostname = canonicalRequestHostname(requestHeaders);
  const sitesAuthenticatedEmail =
    sitesAuthenticatedEmailFromHeaders(requestHeaders);
  const localPlaceholderEmail =
    registrationOpen &&
    process.env.NODE_ENV !== "production" &&
    isLoopbackRequestHostname(hostname)
      ? await getRecoverableLocalDeveloperPlaceholderEmail()
      : null;

  return (
    <AuthForm
      mode="register"
      returnTo={returnTo}
      registrationOpen={registrationAuthorized}
      registrationUnavailableReason={
        registrationOpen && !registrationAuthorized
          ? "L’initialisation anonyme est désactivée sur cette instance publique. Ouvrez cette page avec l’identité propriétaire Sites ou utilisez le mode bootstrap opérateur depuis un environnement maîtrisé."
          : undefined
      }
      suggestedEmail={
        sitesAuthenticatedEmail ?? localPlaceholderEmail ?? undefined
      }
      sitesEmailVerified={Boolean(sitesAuthenticatedEmail)}
      showLocalLegacyHint={
        registrationAuthorized && Boolean(localPlaceholderEmail)
      }
    />
  );
}
