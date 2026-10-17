export function Logo({ taille = "normal" }: { taille?: "normal" | "grand" }) {
  const grand = taille === "grand";
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg aria-hidden viewBox="0 0 32 32" className={grand ? "size-9" : "size-7"}>
        <defs>
          <linearGradient id="dw-degrade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--color-accent-clair)" />
            <stop offset="1" stopColor="var(--color-accent)" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#dw-degrade)" />
        <path
          d="M6 19c3 0 3-3 6-3s3 3 6 3 3-3 6-3 2 1.5 2 1.5M6 24c3 0 3-3 6-3s3 3 6 3 3-3 6-3 2 1.5 2 1.5"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.95"
        />
        <circle cx="21.5" cy="9.5" r="2.5" fill="white" opacity="0.9" />
      </svg>
      <span className={`font-semibold tracking-tight ${grand ? "text-2xl" : "hidden text-base min-[400px]:inline"}`}>Deepwater</span>
    </span>
  );
}
