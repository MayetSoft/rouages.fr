/**
 * La situation des titulaires des marchés : le dernier jugement de procédure
 * collective que le BODACC a publié pour eux dans les vingt-quatre derniers
 * mois, et la cessation que dit SIRENE.
 *
 * Décision du 8 octobre 2026 (`CLAUDE.md`, `docs/07-risques.md`) : un
 * titulaire déjà nommé sous un marché — société ou entrepreneur individuel
 * diffusible — l'est aussi dans sa situation. On retient la nature du jugement
 * telle que le BODACC l'écrit, sa date et l'annonce ; ni le complément, ni le
 * mandataire, ni l'adresse. Les avis de dépôt (état des créances, de
 * collocation) ne disent rien de la marche de l'entreprise : ils sont écartés.
 *
 * Lu par lots de cent SIREN, seulement ceux des marchés publiés — échéances et
 * attributions —, sur l'API ouverte du BODACC (DILA, Licence Ouverte).
 */

const BODACC = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/exports/json';

/** Au-delà, un jugement ne dit plus rien de la situation présente, et il sort du fichier. */
export const MOIS_RETENUS = 24;

/** Le dernier jugement : date (AAAA-MM-JJ), nature telle que publiée, identifiant de l'annonce. */
export type Jugement = [string, string, string];

export interface Situation {
  /** 1 quand SIRENE dit l'unité légale cessée. */
  c?: 1;
  j?: Jugement;
}

interface LigneBodacc {
  id: string;
  dateparution: string;
  registre?: string[] | string | null;
  jugement?: string | null;
}

/** La famille, la nature et la date d'un jugement, lues dans le champ JSON du BODACC. */
export function lireJugement(brut: string | null | undefined): { famille: string; nature: string; date: string | null } | null {
  if (!brut) return null;
  try {
    const j = JSON.parse(brut) as { famille?: string; nature?: string; date?: string };
    const famille = (j.famille ?? '').trim();
    const nature = (j.nature ?? '').trim();
    if (!famille && !nature) return null;
    return { famille, nature, date: /^\d{4}-\d{2}-\d{2}/.test(j.date ?? '') ? j.date!.slice(0, 10) : null };
  } catch {
    return null;
  }
}

/** Un avis de dépôt n'est pas un jugement : il annonce qu'un état est au greffe. */
export const retenu = (famille: string) => !/^avis/i.test(famille);

/**
 * Pour chacun des SIREN soumis, le dernier jugement publié depuis `depuis`
 * (AAAA-MM-JJ). Le plus récent l'emporte, à la date du jugement, sinon de
 * parution.
 */
export async function jugementsBodacc(
  json: <T>(url: string) => Promise<T>,
  sirens: Iterable<string>,
  depuis: string,
): Promise<Map<string, Jugement>> {
  const out = new Map<string, Jugement>();
  const uniques = [...new Set(sirens)].filter((s) => /^\d{9}$/.test(s)).sort();
  for (let i = 0; i < uniques.length; i += 100) {
    const lot = uniques.slice(i, i + 100);
    const where = `familleavis="collective" and dateparution>="${depuis}" and registre in (${lot.map((s) => `"${s}"`).join(',')})`;
    const lignes = await json<LigneBodacc[]>(
      `${BODACC}?select=${encodeURIComponent('id,dateparution,registre,jugement')}&where=${encodeURIComponent(where)}`,
    );
    const voulus = new Set(lot);
    for (const l of lignes) {
      const j = lireJugement(l.jugement);
      if (!j || !retenu(j.famille)) continue;
      const date = j.date ?? l.dateparution?.slice(0, 10);
      if (!date) continue;
      const registres = (Array.isArray(l.registre) ? l.registre : [l.registre ?? '']).map((r) => r.replace(/\s/g, ''));
      for (const s of new Set(registres)) {
        if (!voulus.has(s)) continue;
        const avant = out.get(s);
        if (!avant || date > avant[0] || (date === avant[0] && l.id > avant[2])) out.set(s, [date, j.nature || j.famille, l.id]);
      }
    }
  }
  return out;
}

/** La situation de chaque titulaire qui en a une : jugement récent, ou cessation. */
export function situations(sirens: Iterable<string>, jugements: Map<string, Jugement>, cessees: Set<string>): Map<string, Situation> {
  const out = new Map<string, Situation>();
  for (const s of new Set(sirens)) {
    const x: Situation = {
      ...(cessees.has(s) ? { c: 1 as const } : {}),
      ...(jugements.has(s) ? { j: jugements.get(s)! } : {}),
    };
    if (x.c || x.j) out.set(s, x);
  }
  return out;
}
