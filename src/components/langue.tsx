"use client";

import { createContext, type ReactNode, useContext } from "react";
import { type Langue, localeDe, traducteur, type Traduire } from "@/lib/i18n";

// Langue de l'utilisateur pour les composants du navigateur (fournie par le layout).
const Contexte = createContext<Langue>("fr");

export function FournisseurLangue({ langue, children }: { langue: Langue; children: ReactNode }) {
  return <Contexte.Provider value={langue}>{children}</Contexte.Provider>;
}

export function useLangue(): { langue: Langue; t: Traduire; locale: string } {
  const langue = useContext(Contexte);
  return { langue, t: traducteur(langue), locale: localeDe(langue) };
}
