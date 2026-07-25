import type { Metadata } from "next";
import { JoinClient } from "./join-client";

export const metadata: Metadata = {
  title: "Ouvrir une invitation",
  description: "Échangez votre invitation Revaloop contre une session privée.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default function JoinPage() {
  return <JoinClient />;
}
