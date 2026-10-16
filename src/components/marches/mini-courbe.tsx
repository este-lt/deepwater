// Mini-courbe SVG (aucune dépendance), rendue côté serveur.
export function MiniCourbe({ valeurs, ton }: { valeurs: number[]; ton: "hausse" | "baisse" | "neutre" }) {
  if (valeurs.length < 2) return null;
  const largeur = 120;
  const hauteur = 36;
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const etendue = max - min || 1;
  const points = valeurs.map((v, i) => {
    const x = (i / (valeurs.length - 1)) * largeur;
    const y = hauteur - 3 - ((v - min) / etendue) * (hauteur - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const couleur = { hausse: "var(--color-hausse)", baisse: "var(--color-baisse)", neutre: "var(--color-neutre)" }[ton];
  const idDegrade = `mc-${ton}`;
  return (
    <svg viewBox={`0 0 ${largeur} ${hauteur}`} className="h-9 w-28 shrink-0" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={idDegrade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={couleur} stopOpacity="0.25" />
          <stop offset="1" stopColor={couleur} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${hauteur} ${points.join(" ")} ${largeur},${hauteur}`} fill={`url(#${idDegrade})`} />
      <polyline points={points.join(" ")} fill="none" stroke={couleur} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
