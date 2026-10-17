import { ImageResponse } from "next/og";

// Icône de l'écran d'accueil de l'iPhone (iOS arrondit lui-même les angles).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function IconeApple() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #a597ff, #5b4bf0)" }}>
        <svg width="132" height="132" viewBox="0 0 32 32">
          <path
            d="M6 19c3 0 3-3 6-3s3 3 6 3 3-3 6-3 2 1.5 2 1.5M6 24c3 0 3-3 6-3s3 3 6 3 3-3 6-3 2 1.5 2 1.5"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="21.5" cy="9.5" r="2.5" fill="white" />
        </svg>
      </div>
    ),
    size,
  );
}
