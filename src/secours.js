// Code oublié : un défi et sa réponse.
//
// L'application affiche un « code de demande » tiré au hasard ; la page de
// secours (secours.html, à publier sur sablio.manastria.fr/secours) en
// calcule un « code de secours » valable ce jour-là, qui ouvre le mode adulte.
// Le calcul est public : c'est un garde-fou contre l'oubli, pas une
// protection (le verrou n'en est pas une non plus, les données sont locales).

const SEL = 'sablio-secours';

// Six chiffres au hasard, affichés « 482 913 ».
export function nouvelleDemande() {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return String(n % 1_000_000).padStart(6, '0');
}

export const lisible = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

// SHA-256 de « sel|demande|jour », réduit à six chiffres.
export async function codeSecours(demande, jourIso) {
  const chiffres = String(demande).replace(/\D/g, '');
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${SEL}|${chiffres}|${jourIso}`));
  const n = new DataView(octets).getUint32(0);
  return String(n % 1_000_000).padStart(6, '0');
}
