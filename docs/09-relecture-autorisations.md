# Relecture de l’orienteur des autorisations d’urbanisme

<!-- Fichier produit par `npm run relecture-autorisations` depuis `scripts/autorisations-cas.ts` et `src/modele/autorisations.ts` : ne pas le modifier à la main, sauf pour cocher et annoter. -->

La page `/simulateurs/autorisation` répond, pour les travaux les plus courants, s’il faut une déclaration préalable, un permis de construire ou rien, et si l’architecte est obligatoire. Elle reste **hors du menu et des moteurs de recherche** tant qu’un praticien de l’urbanisme — instructeur, juriste, architecte — n’a pas relu ses réponses (`docs/07-risques.md`, section 9).

Cette feuille donne ses 35 cas de contrôle, chacun tiré d’une phrase d’une fiche de service-public.fr : les travaux, le terrain, la réponse de l’orienteur mot pour mot, ses raisons, ce qu’il a supposé et la fiche dont il vient. Compter une heure. Les règles viennent des fiches, lues le 16 octobre 2026, et non du code de l’urbanisme lui-même : Légifrance refuse les requêtes de l’environnement de développement.

**L’erreur qui compte est la réponse trop légère** — « pas d’autorisation » là où il faut une déclaration —, qui expose à un délit (article L480-4 du code de l’urbanisme). Une réponse trop lourde coûte un dossier de trop. Quand l’orienteur ne sait pas, il prend le cas le plus exigeant et le dit.

**Comment rendre la relecture.** Cocher une case par cas dans ce fichier et annoter ce qui est faux, ou répondre par les numéros. Puis trancher les questions de la fin. Une correction change le modèle et ses cas ; cette feuille se régénère, et la relecture repart des cas touchés.

---

## Quelle autorisation d’urbanisme déposer pour installer un abri de jardin ?

D’après [F662 — Quelle autorisation d’urbanisme déposer pour installer un abri de jardin ?](https://www.service-public.gouv.fr/particuliers/vosdroits/F662), vérifiée le 21 mars 2025, qui cite : R*421-1, R*421-2, R421-9, R421-11.

### 1. Abri indépendant de 5 m²

- **Travaux** : Abri de jardin indépendant, 5 m².
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : pas d’autorisation d’urbanisme.
- **Raison** : Un abri de jardin indépendant de 5 m² ou moins est dispensé de formalité.

- [ ] d’accord
- [ ] à corriger — remarque :

### 2. Abri indépendant de 12 m²

- **Travaux** : Abri de jardin indépendant, 12 m².
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : déclaration préalable.
- **Raison** : Un abri de jardin de plus de 5 m² et jusqu’à 20 m² est soumis à déclaration préalable.

- [ ] d’accord
- [ ] à corriger — remarque :

### 3. Abri indépendant de 25 m²

- **Travaux** : Abri de jardin indépendant, 25 m².
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : permis de construire, architecte non obligatoire.
- **Raison** : Au-delà de 20 m², un abri de jardin est soumis à permis de construire.

- [ ] d’accord
- [ ] à corriger — remarque :

### 4. Abri de 4 m² en secteur protégé

- **Travaux** : Abri de jardin indépendant, 4 m².
- **Terrain et demandeur** : en secteur protégé, par un particulier pour lui-même.
- **Réponse** : déclaration préalable.
- **Raison** : En secteur protégé, un abri de jardin jusqu’à 20 m² est soumis à déclaration préalable.

- [ ] d’accord
- [ ] à corriger — remarque :

### 5. Abri de 4 m² sans savoir le secteur

- **Travaux** : Abri de jardin indépendant, 4 m².
- **Terrain et demandeur** : sans savoir si le terrain est en secteur protégé, par un particulier pour lui-même.
- **Réponse** : déclaration préalable.
- **Raison** : En secteur protégé, un abri de jardin jusqu’à 20 m² est soumis à déclaration préalable.
- **Supposé** : Faute de savoir si le terrain est dans un secteur protégé, on l’a supposé : c’est le cas le plus exigeant.

- [ ] d’accord
- [ ] à corriger — remarque :

### 6. Abri accolé de 3 m²

- **Travaux** : Abri ou annexe accolé à la maison, 3 m².
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : déclaration préalable.
- **Raison** : Un abri accolé modifie l’aspect extérieur du bâtiment : jusqu’à 20 m², il est soumis à déclaration préalable.
- **Supposé** : Un abri accolé au bâtiment peut être traité par le PLU comme une extension — jusqu’à 40 m² en déclaration préalable en zone urbaine — ou comme une construction nouvelle ; on a pris la règle de la construction nouvelle, plus exigeante.

- [ ] d’accord
- [ ] à corriger — remarque :

### 7. Abri accolé de 30 m²

- **Travaux** : Abri ou annexe accolé à la maison, 30 m².
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : permis de construire, architecte non obligatoire.
- **Raison** : Au-delà de 20 m², un abri accolé est soumis à permis de construire.
- **Supposé** : Un abri accolé au bâtiment peut être traité par le PLU comme une extension — jusqu’à 40 m² en déclaration préalable en zone urbaine — ou comme une construction nouvelle ; on a pris la règle de la construction nouvelle, plus exigeante.

- [ ] d’accord
- [ ] à corriger — remarque :

## Quelle autorisation d’urbanisme déposer pour faire un agrandissement extérieur ou une surélévation ?

D’après [F36777 — Quelle autorisation d’urbanisme déposer pour faire un agrandissement extérieur ou une surélévation ?](https://www.service-public.gouv.fr/particuliers/vosdroits/F36777), vérifiée le 11 décembre 2024, qui cite : R421-11, R*421-14, R*421-17.

### 8. Extension de 4 m²

- **Travaux** : Agrandissement de 4 m², surface de plancher totale après travaux 100 m².
- **Terrain et demandeur** : en zone urbaine d’un PLU, hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : déclaration préalable.
- **Raison** : Un agrandissement ou une surélévation qui crée 5 m² ou moins modifie l’aspect extérieur : déclaration préalable.

- [ ] d’accord
- [ ] à corriger — remarque :

### 9. Extension de 35 m² en zone U, total 120 m²

- **Travaux** : Agrandissement de 35 m², surface de plancher totale après travaux 120 m².
- **Terrain et demandeur** : en zone urbaine d’un PLU, hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : déclaration préalable.
- **Raison** : En zone urbaine d’un PLU, un agrandissement ou une surélévation de 35 m² (40 m² au plus) est soumis à déclaration préalable.

- [ ] d’accord
- [ ] à corriger — remarque :

### 10. Extension de 35 m² en zone U, total 160 m²

- **Travaux** : Agrandissement de 35 m², surface de plancher totale après travaux 160 m².
- **Terrain et demandeur** : en zone urbaine d’un PLU, hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : permis de construire, architecte obligatoire.
- **Raison** : En zone urbaine d’un PLU, un agrandissement ou une surélévation jusqu’à 40 m² relève de la déclaration préalable, sauf au-delà de 20 m² quand la surface totale dépasse alors 150 m² : permis de construire.
- **Raison** : La surface de plancher totale dépasse 150 m² après travaux : le recours à un architecte est obligatoire.

- [ ] d’accord
- [ ] à corriger — remarque :

### 11. Extension de 18 m² en zone U, total 160 m²

- **Travaux** : Agrandissement de 18 m², surface de plancher totale après travaux 160 m².
- **Terrain et demandeur** : en zone urbaine d’un PLU, hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : déclaration préalable.
- **Raison** : En zone urbaine d’un PLU, un agrandissement ou une surélévation de 18 m² (40 m² au plus) est soumis à déclaration préalable.

- [ ] d’accord
- [ ] à corriger — remarque :

### 12. Extension de 45 m² en zone U, total 140 m²

- **Travaux** : Agrandissement de 45 m², surface de plancher totale après travaux 140 m².
- **Terrain et demandeur** : en zone urbaine d’un PLU, hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : permis de construire, architecte non obligatoire.
- **Raison** : En zone urbaine d’un PLU, au-delà de 40 m², un agrandissement ou une surélévation est soumis à permis de construire.

- [ ] d’accord
- [ ] à corriger — remarque :

### 13. Extension de 25 m² hors zone U

- **Travaux** : Agrandissement de 25 m², surface de plancher totale après travaux 120 m².
- **Terrain et demandeur** : hors zone urbaine d’un PLU, ou sans PLU, hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : permis de construire, architecte non obligatoire.
- **Raison** : Hors zone urbaine d’un PLU, au-delà de 20 m², un agrandissement ou une surélévation est soumis à permis de construire.

- [ ] d’accord
- [ ] à corriger — remarque :

### 14. Extension de 25 m² en zone U mais secteur protégé

- **Travaux** : Agrandissement de 25 m², surface de plancher totale après travaux 120 m².
- **Terrain et demandeur** : en zone urbaine d’un PLU, en secteur protégé, par un particulier pour lui-même.
- **Réponse** : permis de construire, architecte non obligatoire.
- **Raison** : En secteur protégé, au-delà de 20 m², un agrandissement ou une surélévation est soumis à permis de construire.

- [ ] d’accord
- [ ] à corriger — remarque :

### 15. Extension de 25 m² sans savoir la zone

- **Travaux** : Agrandissement de 25 m², surface de plancher totale après travaux 120 m².
- **Terrain et demandeur** : sans savoir si le terrain est en zone urbaine, sans savoir si le terrain est en secteur protégé, par un particulier pour lui-même.
- **Réponse** : permis de construire, architecte non obligatoire.
- **Raison** : En secteur protégé, au-delà de 20 m², un agrandissement ou une surélévation est soumis à permis de construire.
- **Supposé** : Faute de savoir si le terrain est en zone urbaine d’un PLU, on a pris le seuil hors zone urbaine (20 m² au lieu de 40 m²).
- **Supposé** : Faute de savoir si le terrain est dans un secteur protégé, on l’a supposé : c’est le cas le plus exigeant.

- [ ] d’accord
- [ ] à corriger — remarque :

### 16. Extension de 25 m² hors zone U, total 170 m²

- **Travaux** : Agrandissement de 25 m², surface de plancher totale après travaux 170 m².
- **Terrain et demandeur** : hors zone urbaine d’un PLU, ou sans PLU, hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : permis de construire, architecte obligatoire.
- **Raison** : Hors zone urbaine d’un PLU, au-delà de 20 m², un agrandissement ou une surélévation est soumis à permis de construire.
- **Raison** : La surface de plancher totale dépasse 150 m² après travaux : le recours à un architecte est obligatoire.

- [ ] d’accord
- [ ] à corriger — remarque :

### 17. Extension de 45 m² par une société

- **Travaux** : Agrandissement de 45 m², surface de plancher totale après travaux 100 m².
- **Terrain et demandeur** : en zone urbaine d’un PLU, hors secteur protégé, par une société ou une association.
- **Réponse** : permis de construire, architecte obligatoire.
- **Raison** : En zone urbaine d’un PLU, au-delà de 40 m², un agrandissement ou une surélévation est soumis à permis de construire.
- **Raison** : Pour un permis demandé par une personne morale — une société, une association —, le recours à un architecte est obligatoire.

- [ ] d’accord
- [ ] à corriger — remarque :

### 18. Extension de 30 m² par une société en zone U

- **Travaux** : Agrandissement de 30 m², surface de plancher totale après travaux 100 m².
- **Terrain et demandeur** : en zone urbaine d’un PLU, hors secteur protégé, par une société ou une association.
- **Réponse** : déclaration préalable.
- **Raison** : En zone urbaine d’un PLU, un agrandissement ou une surélévation de 30 m² (40 m² au plus) est soumis à déclaration préalable.

- [ ] d’accord
- [ ] à corriger — remarque :

## Quelle autorisation d’urbanisme déposer pour construire une véranda ?

D’après [F36768 — Quelle autorisation d’urbanisme déposer pour construire une véranda ?](https://www.service-public.gouv.fr/particuliers/vosdroits/F36768), vérifiée le 11 avril 2025, qui cite : R111-22, R*420-1, R*421-1, R*421-2, R421-11, R*421-14, R*421-17.

### 19. Véranda de 30 m² en zone U

- **Travaux** : Véranda de 30 m², surface de plancher totale après travaux 110 m².
- **Terrain et demandeur** : en zone urbaine d’un PLU, hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : déclaration préalable.
- **Raison** : En zone urbaine d’un PLU, une véranda de 30 m² (40 m² au plus) est soumis à déclaration préalable.

- [ ] d’accord
- [ ] à corriger — remarque :

### 20. Véranda de 30 m² hors zone U

- **Travaux** : Véranda de 30 m², surface de plancher totale après travaux 110 m².
- **Terrain et demandeur** : hors zone urbaine d’un PLU, ou sans PLU, hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : permis de construire, architecte non obligatoire.
- **Raison** : Hors zone urbaine d’un PLU, au-delà de 20 m², une véranda est soumis à permis de construire.

- [ ] d’accord
- [ ] à corriger — remarque :

## Installation ou construction d’une piscine privative

D’après [F31404 — Installation ou construction d’une piscine privative](https://www.service-public.gouv.fr/particuliers/vosdroits/F31404), vérifiée le 31 janvier 2025, qui cite : R*421-1, R*421-2 à R*421-8-2, R421-9 à R*421-12.

### 21. Bassin de 9 m²

- **Travaux** : Piscine, bassin de 9 m², sans couverture.
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : pas d’autorisation d’urbanisme.
- **Raison** : Une piscine dont le bassin fait 10 m² ou moins ne demande pas d’autorisation.

- [ ] d’accord
- [ ] à corriger — remarque :

### 22. Bassin de 9 m² en secteur protégé

- **Travaux** : Piscine, bassin de 9 m², sans couverture.
- **Terrain et demandeur** : en secteur protégé, par un particulier pour lui-même.
- **Réponse** : déclaration préalable.
- **Raison** : En secteur protégé, une piscine de 10 m² ou moins est soumise à déclaration préalable.

- [ ] d’accord
- [ ] à corriger — remarque :

### 23. Bassin de 32 m² sans couverture

- **Travaux** : Piscine, bassin de 32 m², sans couverture.
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : déclaration préalable.
- **Raison** : Un bassin de plus de 10 m² et jusqu’à 100 m², sans couverture ou avec une couverture de 1,80 m au plus, est soumis à déclaration préalable.

- [ ] d’accord
- [ ] à corriger — remarque :

### 24. Bassin de 32 m², couverture de plus de 1,80 m

- **Travaux** : Piscine, bassin de 32 m², couverture de plus de 1,80 m.
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : permis de construire, architecte non obligatoire.
- **Raison** : Un bassin de plus de 10 m² avec une couverture de plus de 1,80 m de haut est soumis à permis de construire.

- [ ] d’accord
- [ ] à corriger — remarque :

### 25. Bassin de 120 m²

- **Travaux** : Piscine, bassin de 120 m², sans couverture.
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : permis de construire, architecte non obligatoire.
- **Raison** : Un bassin de plus de 100 m² est soumis à permis de construire.

- [ ] d’accord
- [ ] à corriger — remarque :

### 26. Piscine hors sol trois mois par an

- **Travaux** : Piscine hors sol de 30 m², installée trois mois par an au plus.
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : pas d’autorisation d’urbanisme.
- **Raison** : Une piscine hors sol installée trois mois par an au plus (quinze jours en secteur protégé) ne demande pas d’autorisation.

- [ ] d’accord
- [ ] à corriger — remarque :

## Quelles sont les règles pour construire ou installer une clôture ?

D’après [F3131 — Quelles sont les règles pour construire ou installer une clôture ?](https://www.service-public.gouv.fr/particuliers/vosdroits/F3131), vérifiée le 5 décembre 2025, qui cite : R*421-2, R*421-12, code civil, articles 653 à 673.

### 27. Grillage hors secteur, commune qui ne les soumet pas

- **Travaux** : Grillage ou palissade ; la commune soumet-elle les clôtures à déclaration : non.
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : pas d’autorisation d’urbanisme.
- **Raison** : En principe, une clôture est dispensée de formalité d’urbanisme hors secteur protégé, hors secteur délimité par le PLU et hors commune qui les soumet à déclaration.

- [ ] d’accord
- [ ] à corriger — remarque :

### 28. Grillage, sans savoir si la commune les soumet

- **Travaux** : Grillage ou palissade ; la commune soumet-elle les clôtures à déclaration : on ne sait pas.
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : déclaration préalable.
- **Raison** : Si la commune soumet les clôtures à déclaration — beaucoup le font —, une déclaration préalable est nécessaire.
- **Supposé** : Faute de savoir si la commune soumet les clôtures à déclaration, on l’a supposé.

- [ ] d’accord
- [ ] à corriger — remarque :

### 29. Mur de 2 m

- **Travaux** : Mur de 2 m ou plus ; la commune soumet-elle les clôtures à déclaration : non.
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : déclaration préalable.
- **Raison** : Un mur de 2 mètres ou plus est soumis à déclaration préalable.

- [ ] d’accord
- [ ] à corriger — remarque :

### 30. Clôture en secteur protégé

- **Travaux** : Grillage ou palissade ; la commune soumet-elle les clôtures à déclaration : non.
- **Terrain et demandeur** : en secteur protégé, par un particulier pour lui-même.
- **Réponse** : déclaration préalable.
- **Raison** : En secteur protégé, une clôture ou un mur de clôture est soumis à déclaration préalable.

- [ ] d’accord
- [ ] à corriger — remarque :

### 31. Haie

- **Travaux** : Haie ; la commune soumet-elle les clôtures à déclaration : on ne sait pas.
- **Terrain et demandeur** : sans savoir si le terrain est en secteur protégé, par un particulier pour lui-même.
- **Réponse** : pas d’autorisation d’urbanisme.
- **Raison** : Une haie ne relève pas d’une autorisation d’urbanisme ; elle obéit aux règles de distance et de hauteur du code civil.
- **Supposé** : Faute de savoir si le terrain est dans un secteur protégé, on l’a supposé : c’est le cas le plus exigeant.

- [ ] d’accord
- [ ] à corriger — remarque :

## Quelle autorisation déposer pour faire un changement de destination ou d’usage d’un bâtiment ?

D’après [F35336 — Quelle autorisation déposer pour faire un changement de destination ou d’usage d’un bâtiment ?](https://www.service-public.gouv.fr/particuliers/vosdroits/F35336), vérifiée le 24 avril 2026, qui cite : R151-27 à R151-29, R*421-14, R*421-17, L152-6-5.

### 32. Changement de destination sans toucher la façade

- **Travaux** : Changement de destination, sans modification de la façade ou de la structure porteuse, local de 90 m² de surface de plancher.
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : déclaration préalable.
- **Raison** : Un changement de destination sans modification de la façade ni de la structure porteuse est soumis à déclaration préalable.

- [ ] d’accord
- [ ] à corriger — remarque :

### 33. Changement de destination avec la façade, 90 m²

- **Travaux** : Changement de destination, avec modification de la façade ou de la structure porteuse, local de 90 m² de surface de plancher.
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : permis de construire, architecte non obligatoire.
- **Raison** : Un changement de destination qui modifie la façade ou la structure porteuse est soumis à permis de construire.

- [ ] d’accord
- [ ] à corriger — remarque :

### 34. Changement de destination avec la façade, 200 m²

- **Travaux** : Changement de destination, avec modification de la façade ou de la structure porteuse, local de 200 m² de surface de plancher.
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : permis de construire, architecte obligatoire.
- **Raison** : Un changement de destination qui modifie la façade ou la structure porteuse est soumis à permis de construire.
- **Raison** : Le bâtiment ou le local fait plus de 150 m² de surface de plancher : le recours à un architecte est obligatoire.

- [ ] d’accord
- [ ] à corriger — remarque :

### 35. Changement de sous-destination

- **Travaux** : Changement de sous-destination, à l’intérieur d’une même destination.
- **Terrain et demandeur** : hors secteur protégé, par un particulier pour lui-même.
- **Réponse** : pas d’autorisation d’urbanisme.
- **Raison** : Un changement de sous-destination à l’intérieur d’une même destination est dispensé de formalité d’urbanisme.

- [ ] d’accord
- [ ] à corriger — remarque :

---

## L’architecte

Le recours à l’architecte vient de [F20568 — Dans quel cas doit-on faire appel à un architecte ?](https://www.service-public.gouv.fr/particuliers/vosdroits/F20568), vérifiée le 7 septembre 2026, qui cite : R431-2. L’orienteur l’exige pour un permis de construire quand la surface de plancher totale dépasse 150 m² après travaux, et pour tout permis demandé par une personne morale.

## Les questions à trancher

1. **Le décret n° 2026-117 du 20 février 2026.** Il est postérieur aux fiches de l’abri de jardin, de l’agrandissement, de la véranda, de la piscine et de la clôture. D’après les synthèses lues — pas le texte, Légifrance refusant cet environnement —, il dispense certaines pompes à chaleur et relève des seuils pour le solaire en toiture, sans toucher les seuils retenus ici. Est-ce exact ?

   - [ ] la réponse de l’orienteur convient
   - [ ] à changer — comment :

2. **L’abri accolé.** Le PLU peut le traiter en construction nouvelle ou en extension (jusqu’à 40 m² en déclaration préalable en zone urbaine). L’orienteur retient la construction nouvelle, plus exigeante, et le dit. Ce choix est-il le bon par défaut ?

   - [ ] la réponse de l’orienteur convient
   - [ ] à changer — comment :

3. **L’agrandissement de 5 m² ou moins.** L’orienteur répond « déclaration préalable » en supposant que tout agrandissement modifie l’aspect extérieur. Un agrandissement qui ne le modifie pas existe-t-il en pratique, et faut-il le demander ?

   - [ ] la réponse de l’orienteur convient
   - [ ] à changer — comment :

4. **Le secteur protégé en zone urbaine.** L’orienteur applique en secteur protégé le seuil de 20 m², même en zone urbaine d’un PLU, comme s’il était hors zone urbaine. Le seuil de 40 m² vaut-il dans certains secteurs protégés ?

   - [ ] la réponse de l’orienteur convient
   - [ ] à changer — comment :

5. **La clôture sans réponse sur la commune.** Faute de savoir si la commune soumet les clôtures à déclaration, l’orienteur répond « déclaration préalable ». Le doute penche-t-il dans le bon sens, ou la réponse est-elle trop lourde pour être utile ?

   - [ ] la réponse de l’orienteur convient
   - [ ] à changer — comment :

6. **La piscine hors sol en secteur protégé.** Le formulaire pose une seule question — « installée trois mois par an au plus (quinze jours en secteur protégé) » — et laisse la personne appliquer la bonne durée. Faut-il la séparer ?

   - [ ] la réponse de l’orienteur convient
   - [ ] à changer — comment :

7. **L’architecte du changement de destination.** L’orienteur l’exige au-delà de 150 m² de surface de plancher du bâtiment ou du local, d’après la fiche F20568. La surface à prendre est-elle bien celle-là ?

   - [ ] la réponse de l’orienteur convient
   - [ ] à changer — comment :

## Ce que l’orienteur ne couvre pas

Les pompes à chaleur, les panneaux solaires, les démolitions, le ravalement, les lotissements, les constructions agricoles, les installations techniques, la constructibilité d’un terrain et l’interprétation d’un règlement de PLU. La page le dit, et renvoie à la mairie, à l’assistance de l’État pour les demandes d’autorisation et au certificat d’urbanisme.

Les fiches citées :

- [F662 — Quelle autorisation d’urbanisme déposer pour installer un abri de jardin ?](https://www.service-public.gouv.fr/particuliers/vosdroits/F662), vérifiée le 21 mars 2025
- [F36777 — Quelle autorisation d’urbanisme déposer pour faire un agrandissement extérieur ou une surélévation ?](https://www.service-public.gouv.fr/particuliers/vosdroits/F36777), vérifiée le 11 décembre 2024
- [F36768 — Quelle autorisation d’urbanisme déposer pour construire une véranda ?](https://www.service-public.gouv.fr/particuliers/vosdroits/F36768), vérifiée le 11 avril 2025
- [F31404 — Installation ou construction d’une piscine privative](https://www.service-public.gouv.fr/particuliers/vosdroits/F31404), vérifiée le 31 janvier 2025
- [F3131 — Quelles sont les règles pour construire ou installer une clôture ?](https://www.service-public.gouv.fr/particuliers/vosdroits/F3131), vérifiée le 5 décembre 2025
- [F35336 — Quelle autorisation déposer pour faire un changement de destination ou d’usage d’un bâtiment ?](https://www.service-public.gouv.fr/particuliers/vosdroits/F35336), vérifiée le 24 avril 2026
- [F20568 — Dans quel cas doit-on faire appel à un architecte ?](https://www.service-public.gouv.fr/particuliers/vosdroits/F20568), vérifiée le 7 septembre 2026
