// Lecture CSV (champs entre guillemets, virgules et retours à la ligne dans les champs),
// séparateur au choix. Renvoie une ligne par enregistrement, indexée par l'en-tête.
export function lireCsv(texte: string, separateur = ","): Record<string, string>[] {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = "";
  let guillemets = false;
  const s = texte.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (guillemets) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          champ += '"';
          i++;
        } else guillemets = false;
      } else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === separateur) {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n") {
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
    } else if (c !== "\r") champ += c;
  }
  if (champ || ligne.length) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  const [entete, ...corps] = lignes;
  if (!entete) return [];
  return corps
    .filter((l) => l.some((v) => v !== ""))
    .map((l) => Object.fromEntries(entete.map((nom, i) => [nom, l[i] ?? ""])));
}
