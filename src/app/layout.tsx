import { frFR } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Deepwater",
  description:
    "Terminal de suivi de marché gratuit centré sur le S&P 500 et le Nasdaq-100. Données publiques différées, scoring par règles.",
};

export const viewport: Viewport = {
  themeColor: "#090b10",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ClerkProvider
          localization={{
            ...frFR,
            signIn: {
              ...frFR.signIn,
              start: {
                ...frFR.signIn?.start,
                title: "Connexion à Deepwater",
                subtitle: "Bon retour ! Connectez-vous pour continuer.",
              },
            },
            signUp: {
              ...frFR.signUp,
              start: {
                ...frFR.signUp?.start,
                title: "Créer un compte Deepwater",
                subtitle: "Gratuit, sans carte bancaire.",
              },
            },
          }}
          appearance={{
            variables: {
              colorPrimary: "#7c6cff",
              colorPrimaryForeground: "#ffffff",
              colorBackground: "#10131a",
              colorForeground: "#e8eaf0",
              colorMuted: "#161a23",
              colorMutedForeground: "#8d94a7",
              colorInput: "#161a23",
              colorInputForeground: "#e8eaf0",
              colorNeutral: "#e8eaf0",
              colorBorder: "rgba(255,255,255,0.13)",
              colorDanger: "#f87171",
              colorSuccess: "#34d399",
              borderRadius: "0.75rem",
              fontFamily: "var(--font-geist-sans)",
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
