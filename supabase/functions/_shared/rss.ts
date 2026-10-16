// Lecture de flux RSS 2.0 : titre, lien, date, extrait court. Le texte complet
// des articles n'est jamais récupéré ni stocké.

export interface ElementRss {
  titre: string;
  lien: string;
  extrait: string;
  date: Date | null;
}

const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decoderTexte(brut: string): string {
  return brut
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, nom) => ENTITES[nom.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

const champ = (bloc: string, nom: string): string => {
  const m = bloc.match(new RegExp(String.raw`<${nom}(?:\s[^>]*)?>([\s\S]*?)</${nom}>`));
  return m ? decoderTexte(m[1]) : "";
};

export function analyserRss(xml: string): ElementRss[] {
  const elements: ElementRss[] = [];
  for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)) {
    const bloc = m[1];
    const titre = champ(bloc, "title");
    const lien = champ(bloc, "link") || champ(bloc, "guid");
    if (!titre || !/^https?:\/\//.test(lien)) continue;
    const brute = champ(bloc, "pubDate") || champ(bloc, "dc:date");
    const date = brute ? new Date(brute) : null;
    elements.push({
      titre,
      lien,
      extrait: champ(bloc, "description"),
      date: date && !Number.isNaN(date.getTime()) ? date : null,
    });
  }
  return elements;
}

// Extrait court (au plus 280 caractères, coupé sur un mot) : jamais le texte complet.
export function extraitCourt(texte: string, max = 280): string {
  if (texte.length <= max) return texte;
  const coupe = texte.slice(0, max);
  return `${coupe.slice(0, Math.max(coupe.lastIndexOf(" "), max - 40)).trim()}…`;
}

// Retire les paramètres de suivi (?mod=rss..., ?syn-...) pour dédoublonner les liens.
export function urlCanonique(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)(ft\.com|wsj\.com)$/.test(u.hostname)) u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}
