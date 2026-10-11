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

/** Pourquoi la commune n'a pas été trouvée : de quoi écrire un message juste. */
export type EchecIci = 'refus' | 'position' | 'hors-france' | 'service';

/**
 * La commune où l'on se tient : la position demandée au navigateur, arrondie,
 * puis le contour qui la contient, d'après l'API Découpage administratif.
 */
export function communeIci(): Promise<{ code: string; nom: string }> {
  return new Promise((ok, ko) => {
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const q = new URLSearchParams({
            lat: coords.latitude.toFixed(4),
            lon: coords.longitude.toFixed(4),
            fields: 'code,nom',
            format: 'json',
          });
          const r = await fetch(`${API}?${q}`);
          if (!r.ok) return ko('service' satisfies EchecIci);
          const c = ((await r.json()) as { code: string; nom: string }[])[0];
          if (c) ok(c);
          else ko('hors-france' satisfies EchecIci);
        } catch {
          ko('service' satisfies EchecIci);
        }
      },
      (e) => ko((e.code === e.PERMISSION_DENIED ? 'refus' : 'position') satisfies EchecIci),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  });
}

export const MESSAGES_ICI: Record<EchecIci, string> = {
  refus: 'Position refusée : rien n’a été envoyé. Saisissez le nom de la commune ou son code postal.',
  position: 'La position n’a pas pu être obtenue. Saisissez le nom de la commune ou son code postal.',
  'hors-france': 'Aucune commune française ne contient ce point. Saisissez son nom ou son code postal.',
  service: 'Le service qui situe la commune ne répond pas. Saisissez son nom ou son code postal.',
};

/**
 * Le bouton. Par défaut, il ouvre la page de la commune ; `choisir` en fait
 * autre chose — « Le plus proche » s'en sert comme point de départ.
 */
export function brancherLaOuJeSuis(
  bouton: HTMLButtonElement,
  message: HTMLElement,
  choisir: (c: { code: string; nom: string }) => void = (c) => {
    location.href = `/commune/${c.code}`;
  },
): void {
  if (!('geolocation' in navigator)) return;
  bouton.hidden = false;
  const dire = (texte: string) => {
    message.textContent = texte;
    message.hidden = !texte;
  };
  bouton.addEventListener('click', () => {
    bouton.disabled = true;
    dire('Le navigateur demande votre position…');
    communeIci()
      .then((c) => {
        dire('');
        bouton.disabled = false;
        choisir(c);
      })
      .catch((e: EchecIci) => {
        dire(MESSAGES_ICI[e] ?? MESSAGES_ICI.service);
        bouton.disabled = false;
      });
  });
}
