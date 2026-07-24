import type { Metadata } from "next";
import { Geist_Mono, Instrument_Serif, Manrope } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./product-ui.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: "400",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const rawHost =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "revaloop.dev";
  const candidateHost = rawHost.split(",")[0].trim();
  const host = /^[a-z0-9.-]+(?::\d+)?$/i.test(candidateHost)
    ? candidateHost
    : "revaloop.dev";
  const localHost =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]");
  const rawProtocol =
    requestHeaders.get("x-forwarded-proto") ?? (localHost ? "http" : "https");
  const protocol = rawProtocol === "http" || rawProtocol === "https"
    ? rawProtocol
    : "https";
  const metadataBase = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title: {
      default: "Revaloop — Du lien de test à la validation",
      template: "%s · Revaloop",
    },
    description:
      "La plateforme open source de recette client : partagez une version dédiée, recueillez des retours contextualisés et faites-la valider.",
    icons: {
      icon: "/favicon.png",
      shortcut: "/favicon.png",
    },
    openGraph: {
      title: "Revaloop — Du lien de test à la validation",
      description:
        "Une version dédiée, des retours contextualisés, une validation claire.",
      type: "website",
      locale: "fr_FR",
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: "Revaloop — Du lien de test à la validation.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Revaloop — Du lien de test à la validation",
      description:
        "Une version dédiée, des retours contextualisés, une validation claire.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${manrope.variable} ${instrumentSerif.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
