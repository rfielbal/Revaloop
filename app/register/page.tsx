import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth/auth-form";
import {
  developerRegistrationIsOpen,
  getDeveloperIdentity,
  safeAuthReturnPath,
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
  const identity = await getDeveloperIdentity();

  if (identity) {
    redirect(returnTo);
  }

  const registrationOpen = await developerRegistrationIsOpen();

  return (
    <AuthForm
      mode="register"
      returnTo={returnTo}
      registrationOpen={registrationOpen}
    />
  );
}
