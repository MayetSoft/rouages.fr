# Contribuer à Rouages

Rouages est édité et exploité par **MayetCo SAS** (marque MayetSoft). Le code
est publié sous [GNU AGPL 3.0 ou ultérieure](LICENSE), le contenu éditorial
sous [CC BY-SA 4.0](LICENSE-CONTENU.md).

Signaler une erreur n'est pas contribuer au sens de cette charte : le
[formulaire de signalement](https://rouages.fr/signaler) ouvre une issue, et
une issue ne cède rien. La charte vaut pour ce qui entre dans le dépôt — code,
contenu de `contenu/`, scripts, documentation.

## Ce que vous acceptez en proposant une contribution

En ouvrant une demande de fusion (*pull request*) et en cochant la case prévue
à cet effet, vous acceptez les conditions ci-dessous pour tout ce que cette
demande apporte au dépôt.

### 1. Cession des droits patrimoniaux à MayetCo SAS

Vous cédez à MayetCo SAS, **à titre gratuit et exclusif**, les droits
patrimoniaux d'auteur attachés à votre contribution, à savoir :

- **le droit de reproduction** : la fixer, la copier et la stocker, en tout
  ou partie, sur tout support et par tout procédé ;
- **le droit de représentation** : la communiquer au public par tout moyen, y
  compris en ligne et comme service accessible à distance ;
- **le droit d'adaptation** : la traduire, l'arranger, la modifier, l'intégrer
  à d'autres œuvres ou logiciels, et reproduire le résultat ;
- **le droit de distribution** : la mettre sur le marché, à titre gratuit ou
  onéreux, y compris par location ;
- **le droit de concéder des licences** sur tout ou partie de ces droits, sous
  la licence de son choix, libre ou non.

Le domaine de la cession est le suivant :

- **destination** : toute exploitation, commerciale ou non ;
- **étendue** : les droits énumérés ci-dessus, par tout mode d'exploitation
  connu à la date de la contribution ;
- **lieu** : le monde entier ;
- **durée** : toute la durée de protection légale des droits d'auteur.

Pour un logiciel, la loi limite le droit moral de l'auteur
([art. L121-7 du code de la propriété intellectuelle](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006278899)).
Vous conservez votre **droit au nom** : l'historique du dépôt garde votre
paternité, et MayetCo SAS ne la retire pas.

### 2. Ce que vous gardez

MayetCo SAS vous concède en retour, sans frais et pour toute la durée des
droits, une licence non exclusive d'utiliser, de modifier et de redistribuer
votre propre contribution, à toute fin.

Tout ce qui a été publié sous AGPL ou sous CC BY-SA le reste : une licence
accordée au public ne se reprend pas. La cession permet à MayetCo SAS de
proposer **en plus** d'autres licences ; elle ne retire rien à quiconque a
déjà reçu le code ou le contenu.

### 3. Ce que vous garantissez

- Votre contribution est votre création, ou vous avez le droit de la céder.
- Si vous la réalisez dans le cadre de votre emploi, votre employeur y a
  consenti.
- Elle n'inclut aucun élément tiers incompatible avec l'AGPL 3.0 (pour le
  code) ou avec la CC BY-SA 4.0 (pour le contenu). Tout élément tiers est
  signalé dans la demande, avec sa licence.
- Elle respecte les règles éditoriales du projet (voir `CLAUDE.md`), et
  d'abord celles qui touchent aux personnes :
  - **le contenu ne nomme aucune personne physique** : le graphe de
    `contenu/` décrit des fonctions, jamais leurs titulaires. La validation
    le vérifie, mais elle ne voit pas tout ;
  - **une donnée territoriale ne nomme quelqu'un que dans les cas que
    `CLAUDE.md` énumère** (« Les noms dans les données ») : un registre
    public dont la finalité couvre l'usage, une justification écrite dans
    `docs/07-risques.md` avant la collecte, la source et la date affichées
    avec un lien vers la fiche d'origine, aucune conclusion du site, un
    retrait possible. Une collecte qui nommerait une catégorie de personnes
    absente de cette liste commence par cette justification, et c'est le
    mainteneur qui tranche.

## Avant d'ouvrir une demande

```
npm run verifier-types
npm run valider
npm run build
```

Prenez Le Mayet-de-Montagne (INSEE 03165) pour vos exemples et vos captures :
c'est la commune que le mainteneur sait vérifier d'un coup d'œil.
