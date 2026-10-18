import type { NextConfig } from "next";

// Domaine de l'API Clerk (Frontend API), déduit de la clé publique : pk_test_ ou pk_live_
// suivi du domaine encodé en base64 (instance de développement ou de production).
function domaineClerk(): string | null {
  const encode = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.split("_")[2];
  if (!encode) return null;
  const domaine = Buffer.from(encode, "base64").toString("utf8").replace(/\$$/, "");
  return /^[a-z0-9.-]+$/i.test(domaine) ? `https://${domaine}` : null;
}

// Politique de sécurité du contenu : le navigateur ne charge que le site, Clerk (connexion,
// protection anti-fraude Clerk Protect, anti-robots Cloudflare) et les avatars Clerk. Les polices sont auto-hébergées
// (next/font) et le navigateur n'appelle jamais Supabase directement. « unsafe-inline » :
// scripts d'amorçage de Next.js et feuille de thème générée par utilisateur.
function politiqueContenu(): string {
  const clerk = domaineClerk() ?? "https://*.clerk.accounts.dev";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${clerk} https://*.protect.clerk.com https://challenges.cloudflare.com`,
    // Clerk Protect sonde le réseau sur plusieurs ports (443, 8443, 2082…) : port libre.
    `connect-src 'self' ${clerk} https://*.protect.clerk.com:* https://clerk-telemetry.com`,
    "img-src 'self' data: blob: https://img.clerk.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const production = process.env.NODE_ENV === "production";

// Application entièrement authentifiée et dynamique : pas de Cache Components
// (chaque page lit la session Clerk et les données via RLS au moment de la requête).
const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // En production seulement : le serveur de développement (HTTP, rechargement à chaud)
          // a besoin d'eval et ne passe pas par HTTPS.
          ...(production
            ? [
              { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
              { key: "Content-Security-Policy", value: politiqueContenu() },
            ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
