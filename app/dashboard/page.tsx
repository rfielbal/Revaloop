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
  searchParams: Promise<{
    project?: string;
    release?: string;
    connect_preview?: string;
  }>;
}) {
  const { project, release, connect_preview: connectPreview } =
    await searchParams;

  return (
    <DashboardContent
      project={project}
      release={release}
      connectPreview={connectPreview}
    />
  );
}

async function DashboardContent({
  project,
  release,
  connectPreview,
}: {
  project?: string;
  release?: string;
  connectPreview?: string;
}) {
  const returnParameters = new URLSearchParams();

  if (project) returnParameters.set("project", project);
  if (release) returnParameters.set("release", release);
  if (connectPreview === "1") {
    returnParameters.set("connect_preview", "1");
  }

  const user = await requireDeveloperIdentity(
    `/dashboard${returnParameters.size ? `?${returnParameters.toString()}` : ""}`,
  );
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
      connectPreviewRequested={connectPreview === "1"}
    />
  );
}
