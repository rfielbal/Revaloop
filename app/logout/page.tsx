import type { Metadata } from "next";
import { LogoutClient } from "./logout-client";
import { safeAuthReturnPath } from "../../lib/developer-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Déconnexion",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LogoutPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>;
}) {
  const { return_to: requestedReturnPath } = await searchParams;

  return (
    <LogoutClient
      returnTo={safeAuthReturnPath(requestedReturnPath, "/")}
    />
  );
}
