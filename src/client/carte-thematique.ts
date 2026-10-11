/**
 * La carte d'un département, teintée à la demande : un choix colore chaque
 * commune selon sa classe (voir `src/modele/carte-thematique.ts`). Sans
 * JavaScript, la carte reste celle des intercommunalités.
 */
type Thematique = { id: string; nom: string; source: string; bornes: string[]; classes: string };

export function brancherCartesThematiques(): void {
  for (const figure of document.querySelectorAll<HTMLElement>('[data-thematique-carte]')) {
    const donnees = JSON.parse(figure.querySelector('.cc-donnees')?.textContent ?? '[]') as Thematique[];
    const communes = [...figure.querySelectorAll<SVGAElement>('.carte-communes-commune')];
    const choix = figure.querySelector<HTMLFieldSetElement>('.cc-choix')!;
    const legende = figure.querySelector<HTMLElement>('.cc-legende')!;
    const titres = communes.map((a) => a.querySelector('title')?.textContent ?? '');
    choix.hidden = false;
    choix.addEventListener('change', () => {
      const id = (choix.querySelector('input:checked') as HTMLInputElement | null)?.value ?? '';
      const t = donnees.find((x) => x.id === id);
      figure.classList.toggle('cc-teintee', !!t);
      legende.hidden = !t;
      communes.forEach((a, i) => {
        const q = t?.classes[i] ?? '-';
        a.setAttribute('class', `carte-communes-commune${t ? (q === '-' ? ' cc-sans' : ` cc-q${q}`) : ''}`);
        const titre = a.querySelector('title');
        if (titre) titre.textContent = t ? `${titres[i]} — ${q === '-' ? 'pas de donnée' : `classe ${Number(q) + 1} sur 5`}` : titres[i];
      });
      if (t) {
        const b = t.bornes;
        legende.querySelector('.cc-bornes')!.textContent = `moins de ${b[0]} · ${b[0]} à ${b[1]} · ${b[1]} à ${b[2]} · ${b[2]} à ${b[3]} · ${b[3]} et plus`;
        legende.querySelector('.cc-source')!.textContent = `${t.source} Cinq classes d’autant de communes ; en blanc, pas de donnée.`;
      }
    });
    // La carte s'ouvre sur la première teinte : c'est elle qui donne envie de regarder.
    const premiere = choix.querySelectorAll<HTMLInputElement>('input')[1];
    if (premiere) {
      premiere.checked = true;
      choix.dispatchEvent(new Event('change'));
    }
  }
}
