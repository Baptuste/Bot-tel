# Bot Tel — Feuille de route évolutions & refactoring

Brief de cadence pour la suite du projet, défini avec Claude. À tenir synchronisé
avec [`coeur-et-modules.md`](./coeur-et-modules.md) et [`avancement.md`](./avancement.md).

**Règle transverse** : à chaque étape, `npm run typecheck` + `npm run smoke`
restent verts, et le client `pizzeria` ne voit **aucun** changement de
comportement (sauf mention contraire). Un module absent d'un client ne doit rien
lui coûter (ni requête, ni table, ni écran).

---

## Partie 1 — État de départ

17 briques livrées, chantier « cœur + modules » (6 étapes) terminé. V1 100 %,
V2 ~95 % (reste paiement / pourboire). Historique : `avancement.md`.

---

## Partie 2 — Refactoring du cœur

Objectif : réduire le cœur au socle incompressible.

**Cœur cible** (aucune lecture de `features.ts`) :
`catalog.ts`, `cart.ts`, `orders.ts`, `sessionStore.ts`, `views.ts`,
`callbacks.ts`, `scenes/quantity.ts`, `api/auth.ts`.

### Étape 1 — Extraire le calcul de fiabilité — ✅ fait (`90a2bdc`)
`src/modules/reliability.ts` (calcul + `listReliability` batch). `customers.ts`
= fiche minimale. `orderFlow.customerFlag()` consulte `features.reliability.enabled`.
`reliability` nullable dans les DTO et le front. Validé : boutique-demo ne voit
plus la ligne « Fiabilité » même avec un no-show au compteur.

### Étape 2 — Sortir les messages pré-écrits du cœur — ✅ fait (`6e0571d`)
Flag `messaging.templatesEnabled`. Table `message_templates`, `/api/templates`,
seed et bloc chips Mini App montés seulement si actif. `messageTemplates.ts`
en requêtes à la demande.

### Étape 3 — Nettoyer les textes en dur de `views.ts` — ✅ fait (`2da8914`)
« taille » → `features.variants.label`. `catalog.getMenu()` masque les variantes
si `!features.variants.enabled` (l'éditeur de catalogue `listCatalog` garde tout).
`boutique-demo` devient la config « tout module off ».
**Déviation assumée vs cœur cible** : `catalog.ts` et `views.ts` lisent
maintenant `features.ts` (le passage en paramètre à travers ~8 sites d'appel
coûtait plus qu'il ne rapportait — à rediscuter si besoin).

### Étape 4 — Machine à états paramétrable — ✅ fait (4 phases)
`features.orderFlow` = liste ordonnée d'étapes, chacune avec un rôle sémantique
parmi 5 fixes (`placed / accepted / fulfilling / fulfilled / cancelled`).
`src/orderStages.ts` (helpers + `validateOrderFlow`), `orderFlow.ts` génère les
transitions depuis la config, `OrderStatus` = `string`.

- **Phase 0** (`1b01dff`) : chaîne devient une donnée, comportement identique.
- **Phase 1** (`<hash>`) : backend piloté par les rôles (plus aucun littéral),
  `OrderStatus → string`. Cosmétique assumée : recap `/admin` liste les étapes.
- **Phase 2** (`363bfa2`) : Mini App pilotée par `/api/features` (`useFlow()`,
  badge par `data-role`, onglets dérivés). `OrderStage.shortLabel`.
- **Phase 3** : `boutique-demo` bascule en `pending → confirmed → ready →
  collected` (`PICKUP_FLOW`). `test:boutique` valide le cycle complet + les
  notifications avec le nouveau vocabulaire.

Décisions actées : 5 rôles fixes · linéaire + annulation · `OrderStatus = string`
+ helpers + validation au démarrage · vocabulaire figé après la 1ʳᵉ commande ·
no-show = flag sur l'étape `cancelled`.

---

## Partie 3 — Nouveaux modules (après Partie 2)

### Créneaux à capacité limitée — ✅ fait
- Flag : `deliverySlots.capacityLimit` (null = illimité ; une capacité posée sur
  une tournée précise reste prioritaire).
- Le filtrage par capacité existait déjà dans `getAvailableSlots()` pour
  `routes.max_capacity` (donc côté checkout). Ajouté : la capacité par défaut du
  client, le nombre de places restantes (`Slot.remaining`, affiché dès ≤ 3),
  `hasUpcomingSlots()` pour distinguer « aucun créneau » de « tous complets ».
- Mini App : la carte tournée affiche `n / max — complet`, le placeholder de
  capacité rappelle le défaut du client.
- `npm run test:creneaux` (7 checks).

### Programme de fidélité — ✅ fait
- Flags : `loyalty.{enabled, pointsPerOrder, rewardThreshold, rewardLabel}`.
- **Table séparée `loyalty(user_id, points)`** (pas de colonne sur `customers` :
  le cœur reste minimal). Module `src/modules/loyalty.ts` (requêtes à la demande).
- Points crédités dans `orderFlow.changeStatus` quand une commande atteint le
  rôle `fulfilled`. Notification client au franchissement du palier.
- Bot : commande `/fidelite` (+ menu ☰), ligne « récompense dispo » au récap
  checkout. Admin : ligne « 🎁 récompense à appliquer » sur la commande,
  carte Fidélité + bouton « Utiliser une récompense » sur la fiche client
  (`POST /api/customers/:id/loyalty/redeem`).
- `boutique-demo` : 1 pt/commande, viennoiserie tous les 10. Pizzeria : désactivé.
- `npm run test:loyalty` (13 checks).

### Parrainage — ✅ fait
- Flags : `referral.{enabled, filleulDiscount, parrainReward}` (€).
- Table `referrals(parrain_id, filleul_id UNIQUE, status, filleul_discount,
  parrain_reward, reward_consumed, ...)`. Module `src/modules/referral.ts`.
- **Code = `user_id` en base 36** (court, réversible, pas de table de codes).
- Bot : `/parrainage` (mon code) · `/parrainage <code>` (m'enregistrer comme
  filleul, avant ma 1re commande).
- **`cart.ts` n'est PAS touché** : la réduction est appliquée dans
  `scenes/checkout.ts` au moment de créer la commande (`orders.referral_discount`).
  Filleul : −`filleulDiscount` à sa 1re commande → le parrainage passe
  `completed`, le parrain reçoit un crédit `parrainReward` (notif) consommé
  (partiellement possible) à sa commande suivante.
- Mini App : carte Parrainage sur la fiche client, ligne « Réduction parrainage »
  sur le détail commande.
- `boutique-demo` : 5 € / 5 €. `npm run test:referral` (16 checks).

### Notifications marketing ciblées — ⏸ en attente
- Flag : `marketing.broadcastEnabled`.
- ⚠️ Bloqué : règles Telegram sur les messages non sollicités à vérifier **avant
  tout code**. On avance sur le reste de la Partie 3 sans ce module.

---

## Partie 4 — Bot Configurateur (nouveau projet)

Mini App séparée, mode dual (autonome / accompagné), génère un cahier des charges
texte (sans prix) traduit en `features.ts`. Script des 19 questions +
sauts conditionnels : `script-bot-configurateur.md`. À figer une fois les flags
des modules Partie 3 stabilisés (ajouter une question par nouveau module).

---

## Ordre de cadence

1. Partie 2, étapes 1 → 3 (refactoring, faible risque)
2. Partie 2, étape 4 — **plan détaillé, attendre validation**
3. Partie 3 — Créneaux à capacité limitée ✅
4. Partie 3 — Fidélité ✅
5. Partie 3 — Parrainage ✅
6. Partie 3 — Notifications marketing ⏸ (bloqué : règles Telegram)
7. Partie 4 — Script du configurateur
