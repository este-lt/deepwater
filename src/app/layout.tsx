import { enUS, frFR } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { CSSProperties } from "react";
import { FournisseurLangue } from "@/components/langue";
import { traducteur } from "@/lib/i18n";
import { lirePreferences } from "@/lib/preferences";
import { couleursAccent, STYLES, styleSombre } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const t = traducteur((await lirePreferences()).langue);
  return {
    title: "Deepwater",
    description: t(
      "Terminal de marché gratuit : indices, taux, devises, matières premières, banques centrales, calendrier mondial. Données publiques différées, scoring par règles.",
      "Free market terminal: indices, rates, currencies, commodities, central banks, global calendar. Delayed public data, rules-based scoring.",
    ),
  };
}

export async function generateViewport(): Promise<Viewport> {
  const { theme } = await lirePreferences();
  return {
    themeColor: STYLES.find((s) => s.cle === theme.style)!.fond,
    colorScheme: styleSombre(theme) ? "dark" : "light",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { langue, theme } = await lirePreferences();
  const t = traducteur(langue);
  const accent = couleursAccent(theme);
  const style = STYLES.find((s) => s.cle === theme.style)!;
  const sombre = styleSombre(theme);
  const base = langue === "en" ? enUS : frFR;

  return (
    <html
      lang={langue}
      data-style={theme.style}
      data-densite={theme.densite}
      data-police={theme.police}
      style={{ "--color-accent": accent.accent, "--color-accent-clair": accent.clair, "--color-accent-doux": accent.doux } as CSSProperties}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ClerkProvider
          localization={{
            ...base,
            signIn: {
              ...base.signIn,
              start: {
                ...base.signIn?.start,
                title: t("Connexion à Deepwater", "Sign in to Deepwater"),
                subtitle: t("Bon retour ! Connectez-vous pour continuer.", "Welcome back! Sign in to continue."),
              },
            },
            signUp: {
              ...base.signUp,
              start: {
                ...base.signUp?.start,
                title: t("Créer un compte Deepwater", "Create a Deepwater account"),
                subtitle: t("Gratuit, sans carte bancaire.", "Free, no credit card."),
              },
            },
          }}
          appearance={{
            variables: {
              colorPrimary: accent.accent,
              colorPrimaryForeground: "#ffffff",
              colorBackground: style.surface,
              colorForeground: sombre ? "#e8eaf0" : "#11141b",
              colorMuted: sombre ? "#161a23" : "#f1f3f7",
              colorMutedForeground: sombre ? "#8d94a7" : "#525a6c",
              colorInput: sombre ? "#161a23" : "#ffffff",
              colorInputForeground: sombre ? "#e8eaf0" : "#11141b",
              colorNeutral: sombre ? "#e8eaf0" : "#11141b",
              colorBorder: sombre ? "rgba(255,255,255,0.13)" : "rgba(15,23,42,0.16)",
              colorDanger: "#f87171",
              colorSuccess: "#34d399",
              borderRadius: theme.style === "terminal" ? "0.25rem" : "0.75rem",
              fontFamily: theme.police === "mono" ? "var(--font-geist-mono)" : "var(--font-geist-sans)",
            },
          }}
        >
          <FournisseurLangue langue={langue}>{children}</FournisseurLangue>
        </ClerkProvider>
      </body>
    </html>
  );
}
