// Fenêtres (dialog) : fermer d'un clic à côté, avec confirmation si modifiée.


// --- Fenêtres : fermer d'un clic à côté ---
// Pour une fenêtre de lecture (détail d'un devoir), le clic à côté ferme.
// Pour une fenêtre de saisie modifiée, on demande d'abord : un clic de
// travers ne doit pas faire perdre ce qu'on a tapé.
for (const dialogue of document.querySelectorAll('dialog')) {
  let appuiDehors = false;
  const dehors = (e) => {
    const r = dialogue.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  // L'appui ET le relâchement doivent être à côté : sélectionner du texte
  // et relâcher hors de la fenêtre ne la ferme pas.
  dialogue.addEventListener('pointerdown', (e) => { appuiDehors = e.target === dialogue && dehors(e); });
  dialogue.addEventListener('click', (e) => {
    const fermer = appuiDehors && e.target === dialogue && dehors(e);
    appuiDehors = false;
    if (!fermer) return;
    if (dialogue.dataset.modifie && !confirm('Abandonner les modifications ?')) return;
    dialogue.close();
  });
  // Une saisie de l'utilisateur marque la fenêtre comme modifiée.
  for (const type of ['input', 'change']) {
    dialogue.addEventListener(type, (e) => {
      if (e.isTrusted && dialogue.querySelector('form')) dialogue.dataset.modifie = '1';
    });
  }
  dialogue.addEventListener('close', () => { delete dialogue.dataset.modifie; });
}
