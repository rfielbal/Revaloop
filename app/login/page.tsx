import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth/auth-form";
import {
  developerRegistrationIsOpen,
  developerRegistrationRequestIsAuthorized,
  getDeveloperIdentity,
  safeAuthReturnPath,
} from "../../lib/developer-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous à votre espace développeur Revaloop.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>;
}) {
  const { return_to: requestedReturnPath } = await searchParams;
  const returnTo = safeAuthReturnPath(requestedReturnPath);
  const [identity, requestHeaders, registrationOpen] = await Promise.all([
    getDeveloperIdentity(),
    headers(),
    developerRegistrationIsOpen(),
  ]);

  if (identity) {
    redirect(returnTo);
  }

  const registrationAuthorized =
    registrationOpen &&
    (await developerRegistrationRequestIsAuthorized(requestHeaders));

  return (
    <AuthForm
      mode="login"
      returnTo={returnTo}
      registrationOpen={registrationAuthorized}
    />
  );
}
