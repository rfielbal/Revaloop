export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? "brand-compact" : ""}`}>
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <b />
      </span>
      {!compact && <strong>revaloop</strong>}
    </span>
  );
}
