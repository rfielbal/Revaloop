import type { Metadata } from "next";
import { ConnectPreviewClient } from "./connect-preview-client";

export const metadata: Metadata = {
  title: "Relier une preview",
  description:
    "Transférez une URL de preview temporaire vers votre espace Revaloop.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default function ConnectPreviewPage() {
  return <ConnectPreviewClient />;
}
