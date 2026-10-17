import { enUS, frFR } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FournisseurLangue } from "@/components/langue";
import { traducteur } from "@/lib/i18n";
import { lirePreferences } from "@/lib/preferences";
import { couleursConcretes, cssTheme, definitionStyle, modeEffectif, POLICES, surfaceEffective } from "@/lib/theme";
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
    // Ajout à l'écran d'accueil de l'iPhone : plein écran, barre d'état translucide.
    appleWebApp: { capable: true, title: "Deepwater", statusBarStyle: "black-translucent" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const { theme } = await lirePreferences();
  const clair = couleursConcretes(theme, false);
  const sombre = couleursConcretes(theme, true);
  return {
    // Contenu jusqu'aux bords de l'écran de l'iPhone (encoche, Dynamic Island) ; marges dans globals.css.
    viewportFit: "cover",
    themeColor: modeEffectif(theme) === "auto"
      ? [
        { media: "(prefers-color-scheme: light)", color: clair.fond },
        { media: "(prefers-color-scheme: dark)", color: sombre.fond },
      ]
      : sombre.fond,
    colorScheme: modeEffectif(theme) === "auto" ? "light dark" : sombre.sombre ? "dark" : "light",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { langue, theme } = await lirePreferences();
  const t = traducteur(langue);
  const base = langue === "en" ? enUS : frFR;
  // Les fenêtres Clerk ne lisent pas le CSS : couleurs du mode sombre en mode automatique.
  const c = couleursConcretes(theme, true);
  const police = POLICES.find((p) => p.cle === (theme.police === "style" ? definitionStyle(theme.style).police : theme.police))!;

  return (
    <html
      lang={langue}
      data-style={theme.style}
      data-surface={surfaceEffective(theme)}
      data-gras={theme.gras ? "1" : undefined}
      data-transparence={theme.transparenceReduite ? "reduite" : undefined}
      data-animations={theme.animationsReduites ? "reduites" : undefined}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <style id="theme-utilisateur" dangerouslySetInnerHTML={{ __html: cssTheme(theme) }} />
      </head>
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
              colorPrimary: c.accent,
              colorPrimaryForeground: "#ffffff",
              colorBackground: c.surface,
              colorForeground: c.texte,
              colorMuted: c.surface2,
              colorMutedForeground: c.attenue,
              colorInput: c.surface2,
              colorInputForeground: c.texte,
              colorNeutral: c.texte,
              colorBorder: c.sombre ? "rgba(255,255,255,0.13)" : "rgba(15,23,42,0.16)",
              colorDanger: "#f87171",
              colorSuccess: "#34d399",
              borderRadius: theme.coins === "droits" || (theme.coins === "style" && definitionStyle(theme.style).coins === "droits") ? "0.25rem" : "0.75rem",
              fontFamily: police.pile,
            },
          }}
        >
          <FournisseurLangue langue={langue}>{children}</FournisseurLangue>
        </ClerkProvider>
      </body>
    </html>
  );
}
