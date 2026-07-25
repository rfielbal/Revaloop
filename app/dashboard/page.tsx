import type { Metadata } from "next";
import { requireChatGPTUser, chatGPTSignOutPath } from "../chatgpt-auth";
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
  searchParams: Promise<{ project?: string }>;
}) {
  const user = await requireChatGPTUser("/dashboard");
  const { project } = await searchParams;
  const workspace = await getDeveloperWorkspace(
    {
      displayName: user.displayName,
      email: user.email,
    },
    project,
  );

  return (
    <DashboardClient
      initialWorkspace={workspace}
      renderedAt={new Date().toISOString()}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
