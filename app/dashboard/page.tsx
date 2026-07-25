import type { Metadata } from "next";
import {
  developerLogoutPath,
  requireDeveloperIdentity,
} from "../../lib/developer-auth";
import { getDeveloperWorkspace } from "../../db/repository";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Espace développeur",
  description:
    "Publiez une version de test, invitez votre cliente et suivez chaque retour.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; release?: string }>;
}) {
  const user = await requireDeveloperIdentity("/dashboard");
  const { project, release } = await searchParams;
  const workspace = await getDeveloperWorkspace(
    {
      displayName: user.displayName,
      email: user.email,
    },
    project,
    release,
  );

  return (
    <DashboardClient
      key={`${workspace.activeReview?.project.id ?? "empty"}:${
        workspace.activeReview?.release.id ?? "empty"
      }`}
      initialWorkspace={workspace}
      renderedAt={new Date().toISOString()}
      signOutPath={developerLogoutPath("/")}
    />
  );
}
