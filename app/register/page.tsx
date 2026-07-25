import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth/auth-form";
import { getRecoverableLocalDeveloperPlaceholderEmail } from "../../db/repository";
import {
  canonicalRequestHostname,
  developerRegistrationIsOpen,
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
      registrationOpen={registrationOpen}
      suggestedEmail={
        sitesAuthenticatedEmail ?? localPlaceholderEmail ?? undefined
      }
      sitesEmailVerified={Boolean(sitesAuthenticatedEmail)}
      showLocalLegacyHint={Boolean(localPlaceholderEmail)}
    />
  );
}
