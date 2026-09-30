# Relecture des fiches du 22 et 23 septembre 2026

En deux jours, **13 démarches nouvelles** sont entrées au site, deux ont été
modifiées (contester une délibération, le permis de construire), et une dizaine
de fiches d'acteurs, de compétences et de flux ont été touchées. Chaque
affirmation a été vérifiée contre une source, mais depuis un environnement qui
ne lit pas Légifrance et qui décroche sur plusieurs sites ministériels. Pendant
ce travail, quatre affirmations fausses ont été écartées avant publication.
Rien ne garantit qu'il n'en reste pas une.

Cette feuille ne reprend pas tout. Elle retient **les affirmations qui décident
d'une issue** — un délai, une règle de silence, le juge à saisir — et dit pour
chacune comment elle a été vérifiée. Compter une heure. L'ordre est celui du
risque.

**Comment rendre la relecture.** Cocher les cases dans ce fichier, et annoter
à côté ce qui est faux. Ou répondre point par point, par leur numéro.

La colonne « vérifiée par » distingue trois degrés :

- **page lue** — une page officielle ouverte et lue en entier ;
- **extrait** — le texte d'un article cité par un moteur de recherche, Légifrance
  refusant les requêtes de cet environnement ;
- **secondaire** — un site d'avocat, un blog ou une synthèse, faute de mieux.

---

## 1. Trois affirmations marquées « à confirmer » — à trancher d'abord

Elles sont publiées avec leur réserve, et `npm run relire` les liste. Chacune
demande une page que seul ton navigateur peut ouvrir.

- [ ] **1.1 — Révision ou modification du PLU.** La fiche
  [« Faire évoluer le PLU »](https://rouages.fr/n/modifier-le-plu), étape 1, dit :
  > « Changer les orientations du projet d'aménagement et de développement
  > durables impose la révision ; tout le reste relève de la modification. »

  **Pourquoi c'est douteux.** L'article L153-31 a été réécrit par la loi du
  26 novembre 2025 au 26 mai 2026, et c'est l'ancienne version que les moteurs
  indexent. Celle-ci imposait *aussi* la révision pour réduire un espace boisé
  classé, une zone agricole ou naturelle, une protection contre les risques, ou
  pour ouvrir à l'urbanisation une zone à urbaniser de plus de six ans. Le
  Cerema écrit que la révision ne vaut plus que pour le projet d'aménagement ;
  l'ANIL y ajoute la réduction des espaces protégés et l'ouverture à
  l'urbanisation. L'une des deux se trompe.

  **À lire :** [L153-31 en vigueur](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000052866290).
  Si les autres cas y figurent encore, l'étape 1 est à réécrire ; sinon, il
  suffit de repasser `confiance: etabli`.

- [ ] **1.2 — Le silence de la MDPH.** La fiche
  [« Demander une aide à la MDPH »](https://rouages.fr/n/saisir-la-mdph), levier
  « noter la date », dit :
  > « Au bout de quatre mois sans réponse, la demande est rejetée d'office, et
  > le délai du recours préalable commence à courir sans qu'aucun courrier ne
  > l'annonce. »

  **Pourquoi c'est douteux.** Le rejet à quatre mois est vérifié (R241-33,
  extrait). La seconde moitié de la phrase ne l'est pas, et elle est
  probablement trop forte : en règle générale, les délais de recours contre un
  rejet implicite ne sont opposables que si l'accusé de réception les a
  mentionnés. La phrase risque de décourager quelqu'un qui est encore dans les
  temps.

  **Proposition :** garder la première moitié, et remplacer la seconde par
  « conservez l'accusé de réception : c'est lui qui dit si, et quand, le délai
  de recours a commencé à courir » — à condition que tu confirmes la règle.

- [ ] **1.3 — Les dérogations au collège.** La fiche
  [« Connaître le collège de secteur »](https://rouages.fr/n/choisir-son-college),
  étape 3, dit que la demande s'adresse au directeur académique et qu'elle est
  examinée « dans la limite des places restant après l'inscription des élèves du
  secteur, selon des critères de priorité fixés nationalement ».

  **Pourquoi c'est à confirmer.** Les sites du ministère et des académies
  refusent cet environnement. La liste des critères et leur ordre n'ont été vus
  que dans des résumés de moteur : le handicap de l'élève en premier, puis
  notamment une prise en charge médicale à proximité, la bourse, la fratrie et
  le domicile en limite de secteur — dans un ordre que ces résumés ne donnent
  pas de façon concordante.

  **À lire :** la notice de dérogation de la direction académique de l'Allier.
  Si elle donne la liste et l'ordre, je les ajoute et la fiche passe établie.

---

## 2. Ce que toi seul peux vérifier d'un coup d'œil

- [x] **2.1 — Le PLUi de Vichy Communauté est-il déjà en vigueur ?** La
  page du Mayet-de-Montagne annonçait, sous « Ce qui peut s'y construire », un
  « plan local d'urbanisme intercommunal approuvé le 8 janvier 2026, pour 15
  communes », « pas encore opposable ».

  **Réponse (mainteneur, 30 septembre)** : deux PLUi coexistent, celui de la
  Montagne bourbonnaise et celui de Vichy, pas encore harmonisés.

  **Ce que la vérification a trouvé : le bloc était faux.** Les quinze communes
  du document du Géoportail sont exactement celles de la Montagne
  bourbonnaise — le rattachement du Mayet est juste. Mais le 8 janvier 2026
  n'est pas une approbation : c'est l'arrêté 2026-005 du président de Vichy
  Communauté, qui annexe à tous les documents du territoire le règlement local
  de publicité modifié. Il vise « le PLUi valant SCoT de la Montagne
  Bourbonnaise approuvé […] le 31 mars 2022, modifié […] le 29 septembre 2022
  puis du 11 décembre 2025 » — pièce `200071363_procedure_20260108_A.pdf` du
  Géoportail, et [page de Vichy Communauté](https://www.vichy-communaute.fr/plui-montagne-bourbonnaise/).
  La date du Géoportail est celle de la dernière procédure déposée, et son état
  « approuvé » ne veut pas dire « pas encore opposable » : il en porte des
  centaines datés de 2022. Le bloc dit désormais seulement qu'une version datée
  du 8 janvier 2026 est publiée, ce que peut être cette date, et renvoie à son
  règlement. Il paraît sur 12 779 communes au lieu de 4 809, puisqu'on ne trie
  plus sur un état qui ne dit rien.

  À noter : la [page du PLU du Mayet](https://www.vichy-communaute.fr/plu-mayet-de-montagne/)
  sur le site de Vichy Communauté donne encore le PLU communal de 2011 et un
  PLUi « en cours d'élaboration ». Elle date d'avant 2022.

- [x] **2.2 — Qui organise le transport scolaire au Mayet ?** La fiche
  [« Inscrire un enfant au transport scolaire »](https://rouages.fr/n/inscrire-au-transport-scolaire)
  ne tranche pas : la région, ou l'autorité organisatrice de la mobilité si la
  commune est dans son ressort.

  **Réponse (mainteneur, 30 septembre)** : Vichy Communauté — « Vichy
  Communauté organise les transports scolaires sur son territoire »
  ([page](https://www.vichy-communaute.fr/services/se-deplacer/transport-scolaire/)).
  La fiche est juste pour le Mayet : c'est le cas « AOM dans son ressort ».

---

## 3. Les affirmations décisives, fiche par fiche

Vérifiées, publiées comme établies. À relire en priorité celles marquées
**extrait** ou **secondaire**.

### Faire appel d'un jugement du tribunal administratif — [page](https://rouages.fr/n/faire-appel)

- [ ] Le délai d'appel court de la **notification**, et une notification qui ne
  mentionne pas un délai plus court laisse deux mois. — R811-2, *extrait*.
- [ ] L'avocat est **obligatoire en appel**, y compris contre un jugement rendu
  sur un recours pour excès de pouvoir ; exceptions étroites, « comme les
  contraventions de grande voirie ». — R811-7, *extrait* ; la liste des
  exceptions vient d'un blog d'avocats, *secondaire*. Un premier résultat
  donnait une version périmée de l'article, qui dispensait d'avocat l'excès de
  pouvoir : c'est l'erreur écartée.
- [ ] **En zone tendue, pas d'appel** contre un permis de construire de plus de
  deux logements, pour les recours introduits jusqu'au 31 décembre 2027. —
  R811-1-1, *extrait* et Dalloz actualité, *secondaire*. La fiche simplifie le
  champ exact, qui couvre aussi d'autres autorisations.
- [ ] Le **pourvoi en cassation ne suspend pas** la décision ; deux mois, trois
  depuis l'outre-mer, quatre depuis l'étranger. — [justice.fr](https://www.justice.fr/fiche/pourvoi-cassation-devant-conseil-etat), *page lue*.

### Contester une loi au cours d'un procès (QPC) — [page](https://rouages.fr/n/poser-une-qpc)

- [ ] Trois mois au Conseil d'État ou à la Cour de cassation, faute de quoi
  **le Conseil constitutionnel est saisi de plein droit**. — [conseil-etat.fr](https://www.conseil-etat.fr/decisions-de-justice/jurisprudence/analyses-de-jurisprudence/dossiers-thematiques/la-question-prioritaire-de-constitutionnalite-devant-la-juridiction-administrative), *page lue*.
- [ ] Le refus du premier juge ne se conteste qu'avec l'appel ou le pourvoi ;
  celui du second filtre est sans recours. — [Conseil constitutionnel](https://www.conseil-constitutionnel.fr/nouveaux-cahiers-du-conseil-constitutionnel/12-questions-reponses-sur-la-question-prioritaire-de-constitutionnalite), *page lue*.
- [ ] *Complément suggéré, non vérifié ici :* la fiche dit que la disposition
  déclarée contraire « est abrogée et disparaît ». Le Conseil peut en reporter
  la date d'effet, et une personne qui a gagné sa QPC peut ne pas en bénéficier
  tout de suite. À ajouter si tu le confirmes.

### Faire interroger le Gouvernement — [page](https://rouages.fr/n/question-ecrite)

- [ ] Deux mois pour répondre, à l'Assemblée comme au Sénat ; 28 questions
  « signalées » choisies par les présidents de groupe, réponse sous dix jours. —
  [Assemblée](https://www.assemblee-nationale.fr/dyn/synthese/fonctionnement-assemblee-nationale/evaluation-politiques-publiques-controle-gouvernement/les-questions) et [Sénat](https://www.senat.fr/connaitre-le-senat/role-et-fonctionnement/les-questions-ecrites.html), *pages lues*. De mémoire, j'aurais écrit un mois : c'est l'erreur écartée.
- [ ] **Cinquante-deux questions par député et par session**, plafond fixé en
  2015. — Assemblée, *page lue*. La page du Sénat ne mentionne aucun quota ; la
  fiche le dit ainsi, sans affirmer qu'il n'en existe pas.

### Demander l'allocation personnalisée d'autonomie — [page](https://rouages.fr/n/demander-apa)

- [ ] **Deux mois de silence valent accord**, au forfait (la moitié du plafond du
  premier degré de perte d'autonomie), jusqu'à la décision expresse. —
  [département du Pas-de-Calais](https://www.pasdecalais.fr/lallocation-personnalisee-dautonomie-apa-domicile), *page lue* ; L232-14, *extrait*.
- [ ] **Jamais reprise sur la succession**, ni auprès d'un légataire, d'un
  donataire ou d'un bénéficiaire d'assurance-vie. — [service-public](https://www.service-public.gouv.fr/particuliers/vosdroits/F10009), *page lue*.
- [ ] Recours préalable **obligatoire** auprès du président du conseil
  départemental, puis tribunal administratif. — service-public, *page lue*.
- [ ] Le département informe le CCAS ou le maire du dossier complet. — R232-23,
  résumé de moteur, *secondaire*.

### Demander une aide à la MDPH — [page](https://rouages.fr/n/saisir-la-mdph)

- [ ] Recours préalable obligatoire sous deux mois ; **tribunal judiciaire** pour
  l'allocation aux adultes handicapés et la carte mention invalidité ou
  priorité, **tribunal administratif** pour la carte mention stationnement et la
  reconnaissance de travailleur handicapé. — [MDPH de Seine-et-Marne](https://www.mdph77.fr/fr/les-voies-de-recours), *page lue*.
- [ ] La conciliation suspend le délai du recours préalable si elle est demandée
  avant lui, pas après. — MDPH 77, *page lue*.
- Le levier sur le silence de quatre mois : voir **1.2**.

### S'opposer à une installation classée — [page](https://rouages.fr/n/installation-classee)

- [ ] Pour les demandes déposées **depuis le 22 octobre 2024**, la consultation
  du public dure trois mois, en parallèle de l'instruction, sous un commissaire
  enquêteur, avec deux réunions publiques. — [préfecture d'Eure-et-Loir](https://www.eure-et-loir.gouv.fr/Publications/Enquetes-Publiques-et-consultation-du-public/Presentation-de-la-loi-industrie-verte-et-de-la-nouvelle-participation-du-public-L181-10-1-du-Code-de-l-Environnement), *page lue*.
- [ ] Recours des tiers : **quatre mois**, notification obligatoire ; réclamation
  possible après la mise en service, deux mois de silence du préfet valant
  rejet. — R181-50 à R181-52, *extrait*.
- [ ] *À préciser :* la fiche ne vaut que pour les installations **soumises à
  autorisation**. Beaucoup d'élevages relèvent de l'enregistrement ou de la
  déclaration, sans cette consultation. Le déclencheur le dit, le résumé non —
  il cite l'élevage en premier. Et la durée de trois mois est rangée comme
  « indicative », alors qu'elle est fixée par le texte.

### Connaître le collège de secteur — [page](https://rouages.fr/n/choisir-son-college)

- [ ] Le **conseil départemental** arrête le secteur, après avis du conseil
  départemental de l'éducation nationale ; **l'État** affecte l'élève. — L213-1,
  *extrait*.
- Les dérogations : voir **1.3**.

### Inscrire un enfant au transport scolaire — [page](https://rouages.fr/n/inscrire-au-transport-scolaire)

- [ ] La région organise, sauf dans le ressort d'une autorité organisatrice de
  la mobilité. — L3111-7, *extrait*.
- [ ] La règle « domicile et établissement dans le même ressort » et les **deux
  inscriptions** pour un trajet qui franchit la limite viennent du [règlement
  régional d'Auvergne-Rhône-Alpes](https://www.cc-hautlignon.fr/wp-content/uploads/2025/05/43_Reglement-TS-2025-2026.pdf),
  édition Haute-Loire, *page lue*. La fiche le présente comme une règle
  régionale, non nationale.

### Devenir assistant maternel — [page](https://rouages.fr/n/devenir-assistant-maternel)

- [ ] **Trois mois de silence valent agrément.** — L421-6, *extrait*.
- [ ] L'agrément est instruit par les professionnels de la PMI ; 120 heures de
  formation, dont 80 avant le premier enfant. — [département de la Savoie](https://www.savoie.fr/web/psw_39685/devenir-assistant-e-maternel-le), *page lue*.
- [ ] La formation est **financée** par le département. — résumé de moteur
  (L421-14), *secondaire* : la page de la Savoie ne le dit pas.

### Connaître la qualité de l'eau du robinet — [page](https://rouages.fr/n/qualite-eau-robinet)

- [ ] L'exploitant surveille, l'ARS contrôle ; résultats **affichés en mairie**,
  publiés sur le site du ministère, et résumés une fois par an avec la facture.
  — [ARS Bretagne](https://www.bretagne.ars.sante.fr/leau-destinee-la-consommation-humaine), *page lue*. Est-ce l'usage au Mayet ?

### Faire évoluer le PLU — [page](https://rouages.fr/n/modifier-le-plu)

- L'étape 1 : voir **1.1**.
- [ ] Sous plan intercommunal, l'avis défavorable d'une commune oblige le conseil
  communautaire à redélibérer, et à réunir les **deux tiers** pour passer outre.
  — L153-15 et L153-21, *extrait*. Ces articles datent de 2020 ; la loi de 2025
  a pu les toucher, comme elle a touché L153-31.
- [ ] Mise à disposition du public d'un mois en modification, modalités portées
  à connaissance huit jours avant. — L153-41, *extrait*. La fiche écrit « un
  mois au moins », le texte « un mois ».
- [ ] **Six mois** après la prise d'effet, un vice de procédure ne peut plus être
  invoqué par voie d'exception, sauf défaut de mise à disposition et violation
  des règles de l'enquête. — L600-1, *extrait*.

### Peser sur le schéma régional d'aménagement — [page](https://rouages.fr/n/schema-regional)

- [ ] Adopté par **délibération du conseil régional**, approuvé par **arrêté du
  préfet de région**, qui peut refuser par décision motivée. — L4251-7,
  *extrait*.
- [ ] Avis des personnes associées réputé favorable après trois mois. — L4251-6,
  *extrait*.

### Suivre un contrôle de la chambre régionale des comptes — [page](https://rouages.fr/n/controle-chambre-comptes)

- [ ] Rapport débattu à la plus proche réunion, **publié au plus tard deux mois**
  après sa communication, **rien en période électorale** à partir du premier jour
  du troisième mois avant le scrutin. — L243-6, *extrait*.
- [ ] Sous une intercommunalité, le rapport revient devant **chaque conseil
  municipal** ; rapport sur les suites **dans l'année**. — L243-8 et L243-9,
  *extrait*.
- [ ] Un habitant peut proposer un thème de contrôle. — [plateforme de la Cour](https://participationcitoyenne.ccomptes.fr/), *page lue*.

### Leviers ajoutés à des démarches existantes

- [ ] **Réclamation fiscale** (contester une délibération) : jusqu'au
  31 décembre de l'année suivant la mise en recouvrement ; l'annulation obtenue
  par un autre contribuable ne rouvre pas votre délai. — [BOFiP](https://bofip.impots.gouv.fr/bofip/597-PGP.html/identifiant=BOI-CTX-PREA-10-30-20260422), *page lue*.
- [ ] **Conseil gratuit du CAUE** (permis de construire) ; architecte obligatoire
  au-delà de 150 m² pour un particulier qui construit pour lui-même. — loi du
  3 janvier 1977 et [CAUE de la Haute-Vienne](https://www.caue87.fr/nouveau-seuil-pour-le-recours-a-larchitecte-150m%C2%B2-de-surface-de-plancher/), *page lue*.

---

## 4. Hors démarches : ce qui a changé ailleurs

- [ ] **Cour des comptes** — elle *certifie* les comptes de l'État, elle ne les
  « juge » plus ; le jugement des comptables a disparu au 1er janvier 2023. —
  art. 47-2 de la Constitution, *extrait* ; plateforme de la Cour, *page lue*.
- [ ] **Chambre régionale des comptes** — quatre missions, dont l'évaluation des
  politiques publiques depuis 2022. Reste à réexaminer : elle figure toujours
  parmi les acteurs de la compétence « comptable public », lien qui tenait au
  jugement des comptes disparu.
- [ ] **Conseil régional** — seul compétent pour définir les aides aux
  entreprises (L1511-2, *extrait*).
- [ ] **Défense extérieure contre l'incendie** — nouvelle compétence du maire,
  selon un règlement départemental que le SDIS élabore et que le préfet arrête.
  — [préfecture du Cher](https://www.cher.gouv.fr/Actions-de-l-Etat/Securites/Securite-civile/Defense-exterieure-contre-l-incendie-DECI), *page lue*.
- [ ] **Contribution communale au SDIS** — nouveau flux, dépense obligatoire ;
  pour Le Mayet, sans doute versée par Vichy Communauté, qui déclare cette
  compétence. La fiche dit que la commune « peut l'avoir transférée ».
- [ ] **Taxe d'enlèvement des ordures ménagères** — depuis la loi de finances
  pour 2019, le dégrèvement qui suit une délibération illégale est à la charge
  de la collectivité. — [BOFiP](https://bofip.impots.gouv.fr/bofip/3650-PGP.html/identifiant%3DBOI-IF-AUT-90-10-20240703), *page lue*.
- [ ] **Cour de cassation** — acteur ajouté ; « elle ne rejuge pas les faits ».
  — [ministère de la Justice](https://www.justice.gouv.fr/justice-france/lorganisation-cours-tribunaux/lordre-judiciaire/cour-cassation), *page lue*.

---

## Après la relecture

Chaque correction que tu signales entre dans le contenu avec sa source, comme
pendant la relecture générale. Une affirmation confirmée repasse
`confiance: etabli` ; une affirmation fausse est réécrite, pas supprimée en
silence, et la feuille de route garde la trace de ce qui était écrit.
