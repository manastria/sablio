// Contenu d'un devoir : texte mis en forme, souvent collé depuis l'ENT.
//
// On ne garde qu'une liste fermée de balises (paragraphes, gras, italique,
// souligné, listes, liens) et aucun attribut, sauf l'adresse d'un lien web.
// Le nettoyage est fait à la saisie ET à l'affichage : une sauvegarde
// restaurée peut contenir n'importe quoi.

const GARDER = new Set(['P', 'BR', 'STRONG', 'EM', 'U', 'UL', 'OL', 'LI', 'A']);
const RENOMMER = { B: 'STRONG', I: 'EM' };
// Blocs inconnus : deviennent des paragraphes, pour garder les retours à la ligne.
const BLOCS = new Set([
  'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'BLOCKQUOTE', 'PRE', 'ADDRESS',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'TR', 'DL', 'DT', 'DD', 'FIGURE', 'FIGCAPTION',
]);
// Supprimés avec leur contenu.
const SUPPRIMER = new Set([
  'SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'IMG', 'VIDEO',
  'AUDIO', 'CANVAS', 'NOSCRIPT', 'HEAD', 'TITLE', 'META', 'LINK', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FORM',
]);
const TITRES = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

// Une balise <span style="font-weight: bold"> (éditeurs en ligne, traitements de texte).
function styleEnBalise(el) {
  const style = el.getAttribute('style') ?? '';
  if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) return 'STRONG';
  if (/font-style\s*:\s*italic/i.test(style)) return 'EM';
  if (/text-decoration[^;]*underline/i.test(style)) return 'U';
  return null;
}

function copier(source, cible, doc) {
  for (const n of source.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      cible.append(doc.createTextNode(n.textContent));
      continue;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) continue;
    const balise = n.tagName.toUpperCase();
    if (SUPPRIMER.has(balise)) continue;
    let nom = RENOMMER[balise] ?? (GARDER.has(balise) ? balise : null);
    if (!nom && BLOCS.has(balise)) nom = 'P';
    if (!nom && balise === 'SPAN') nom = styleEnBalise(n);
    if (!nom && (balise === 'TD' || balise === 'TH')) {
      copier(n, cible, doc);
      cible.append(doc.createTextNode(' '));
      continue;
    }
    if (!nom) { // balise inconnue : on garde son contenu
      copier(n, cible, doc);
      continue;
    }
    // Pas de paragraphe dans un paragraphe : on aplatit, avec un retour à la ligne.
    if (nom === 'P' && (cible.tagName === 'P' || cible.tagName === 'LI')) {
      copier(n, cible, doc);
      cible.append(doc.createElement('br'));
      continue;
    }
    const el = doc.createElement(nom);
    if (nom === 'A') {
      const href = (n.getAttribute('href') ?? '').trim();
      if (!/^(https?:|mailto:)/i.test(href)) {
        copier(n, cible, doc);
        continue;
      }
      el.setAttribute('href', href);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
    if (TITRES.has(balise)) {
      const gras = doc.createElement('strong');
      copier(n, gras, doc);
      el.append(gras);
    } else {
      copier(n, el, doc);
    }
    if (nom === 'BR' || el.textContent.trim()) cible.append(el);
  }
}

// HTML quelconque -> HTML limité et sûr.
export function nettoyerHtml(html) {
  // DOMParser n'exécute rien et ne charge rien (ni scripts ni images).
  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  const sortie = doc.createElement('div');
  copier(doc.body, sortie, doc);
  // Retours à la ligne en trop au début et à la fin.
  while (sortie.firstChild?.nodeName === 'BR') sortie.firstChild.remove();
  while (sortie.lastChild?.nodeName === 'BR') sortie.lastChild.remove();
  return sortie.innerHTML.trim();
}

// Texte brut lisible (listes, aperçus, notifications, export) : les blocs et
// les <br> deviennent des retours à la ligne, les éléments de liste des puces.
export function texteBrut(html) {
  const doc = new DOMParser().parseFromString(nettoyerHtml(html), 'text/html');
  const lignes = [];
  let ligne = '';
  const couper = () => {
    if (ligne.trim()) lignes.push(ligne.trim());
    ligne = '';
  };
  const parcourir = (noeud) => {
    for (const n of noeud.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) ligne += n.textContent.replace(/\s+/g, ' ');
      else if (n.nodeName === 'BR') couper();
      else if (n.nodeName === 'LI') {
        couper();
        ligne = '• ';
        parcourir(n);
        couper();
      } else if (n.nodeName === 'P' || n.nodeName === 'UL' || n.nodeName === 'OL') {
        couper();
        parcourir(n);
        couper();
      } else parcourir(n);
    }
  };
  parcourir(doc.body);
  couper();
  return lignes.join('\n');
}

// Texte brut (ancien devoir, sans mise en forme) -> HTML affichable.
export function htmlDepuisTexte(texte) {
  const echapper = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return String(texte ?? '').split('\n').map(echapper).join('<br>');
}
