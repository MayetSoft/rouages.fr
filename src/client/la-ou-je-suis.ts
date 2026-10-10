/**
 * « Là où je suis » : trouver la commune où l'on se tient, sans taper son nom.
 *
 * Le navigateur demande d'abord la permission ; le site ne voit la position
 * que si on l'accorde. Elle est envoyée une fois, arrondie à quatre décimales
 * (une dizaine de mètres), à l'API Découpage administratif de l'État
 * (geo.api.gouv.fr), qui dit dans quel contour communal tombe le point — un
 * calcul exact aux limites, que le site ne saurait pas faire sans charger les
 * contours de toute la France. Rien n'est gardé : ni par Rouages, qui n'a
 * pas de serveur applicatif, ni dans le navigateur.
 */
const API = 'https://geo.api.gouv.fr/communes';

export function brancherLaOuJeSuis(bouton: HTMLButtonElement, message: HTMLElement): void {
  if (!('geolocation' in navigator)) return;
  bouton.hidden = false;
  const dire = (texte: string) => {
    message.textContent = texte;
    message.hidden = !texte;
  };
  bouton.addEventListener('click', () => {
    bouton.disabled = true;
    dire('Le navigateur demande votre position…');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          dire('Recherche de la commune…');
          const q = new URLSearchParams({
            lat: coords.latitude.toFixed(4),
            lon: coords.longitude.toFixed(4),
            fields: 'code,nom',
            format: 'json',
          });
          const r = await fetch(`${API}?${q}`);
          const communes = r.ok ? ((await r.json()) as { code: string; nom: string }[]) : [];
          const c = communes[0];
          if (!c) {
            dire('Aucune commune française ne contient ce point. Saisissez son nom ou son code postal.');
            bouton.disabled = false;
            return;
          }
          dire(`${c.nom} : ouverture de sa page…`);
          location.href = `/commune/${c.code}`;
        } catch {
          dire('Le service qui situe la commune ne répond pas. Saisissez son nom ou son code postal.');
          bouton.disabled = false;
        }
      },
      (e) => {
        dire(
          e.code === e.PERMISSION_DENIED
            ? 'Position refusée : rien n’a été envoyé. Saisissez le nom de la commune ou son code postal.'
            : 'La position n’a pas pu être obtenue. Saisissez le nom de la commune ou son code postal.',
        );
        bouton.disabled = false;
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  });
}
