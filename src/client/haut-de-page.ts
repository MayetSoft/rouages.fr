/**
 * Revenir en haut de la page. Le bouton n'apparaît qu'une fois descendu de
 * plus d'un écran et demi : sur une page courte, il ne servirait à rien. Il
 * rend aussi le focus au début du contenu, pour qui navigue au clavier.
 */
const bouton = document.querySelector<HTMLAnchorElement>('.haut-de-page');
if (bouton) {
  let visible = false;
  const regarder = () => {
    const doit = scrollY > innerHeight * 1.5;
    if (doit !== visible) {
      visible = doit;
      bouton.hidden = !doit;
    }
  };
  addEventListener('scroll', regarder, { passive: true });
  regarder();
  bouton.addEventListener('click', (e) => {
    e.preventDefault();
    scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const debut = document.querySelector<HTMLElement>('main h1') ?? document.getElementById('contenu');
    if (debut) {
      debut.tabIndex = -1;
      debut.focus({ preventScroll: true });
    }
  });
}
