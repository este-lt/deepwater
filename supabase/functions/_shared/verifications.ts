// Assertions minimales pour les tests Deno (aucune dépendance externe à télécharger).

export function assert(condition: unknown, message = "assertion fausse"): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertEquals<T>(reel: T, attendu: T, message?: string): void {
  const a = JSON.stringify(reel);
  const b = JSON.stringify(attendu);
  if (a !== b) throw new Error(`${message ? `${message} : ` : ""}obtenu ${a}, attendu ${b}`);
}

export function assertAlmostEquals(reel: number, attendu: number, tolerance = 1e-7): void {
  if (!(Math.abs(reel - attendu) <= tolerance)) throw new Error(`obtenu ${reel}, attendu ${attendu} (± ${tolerance})`);
}
