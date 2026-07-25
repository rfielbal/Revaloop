import Link from "next/link";
import { Brand } from "../../components/brand";

export function ReviewUnavailable({
  title,
  message,
  retryHref,
}: {
  title: string;
  message: string;
  retryHref?: string;
}) {
  return (
    <main className="review-unavailable revaloop-unavailable">
      <Link href="/" aria-label="Accueil Revaloop">
        <Brand />
      </Link>
      <section>
        <span aria-hidden="true">⌁</span>
        <p className="eyebrow">Accès indisponible</p>
        <h1>{title}</h1>
        <p>{message}</p>
        <p className="review-unavailable-help">
          Revaloop ne révèle aucune information sur le projet tant que l’accès
          n’est pas reconnu.
        </p>
        {retryHref ? (
          <Link className="button button-primary" href={retryHref}>
            Réessayer
          </Link>
        ) : null}
      </section>
    </main>
  );
}
