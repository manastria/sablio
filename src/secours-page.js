// Page de secours : code de demande -> code de secours du jour.
import { codeSecours, lisible } from './secours.js';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

document.querySelector('#formulaire').addEventListener('submit', async (e) => {
  e.preventDefault();
  const demande = document.querySelector('#demande').value.replace(/\D/g, '');
  const reponse = document.querySelector('#reponse');
  if (demande.length !== 6) {
    reponse.textContent = 'Le code de demande a six chiffres.';
    return;
  }
  reponse.textContent = `Code de secours : ${lisible(await codeSecours(demande, iso(new Date())))}`;
});
