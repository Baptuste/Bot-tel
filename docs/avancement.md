# Journal d'avancement

État du projet et historique des briques livrées (développées les 27–28 août 2026).
Pour le "pourquoi" des choix : [`cadrage.md`](./cadrage.md) (cadrage initial) et
[`coeur-et-modules.md`](./coeur-et-modules.md) (direction : cœur générique + modules).

> Dernière mise à jour : 2026-09-01 — **Mini App client livrée** (vitrine catalogue/panier/checkout,
> panier partagé bot ↔ Mini App) + **mise en production** sur Oracle Cloud (cf.
> [`deploiement.md`](./deploiement.md)).

**Modularisation « cœur + modules » : terminée** (6 étapes, section dédiée plus
bas) — voir [`coeur-et-modules.md`](./coeur-et-modules.md). Le bot est piloté par
`src/features.ts` (`CLIENT_ID`, défaut `pizzeria`) ; un client « retrait
boutique » fictif (`boutique-demo`) passe le parcours complet sans que le cœur
soit modifié.

Bot de test : **@Testshopa1bot** (token dans `.env`, non commité).
`ADMIN_IDS=786545252` (compte de l'utilisateur).

Vérification : `npm run typecheck` (0) + `smoke` (**66**) + `test:boutique`
(**29**) + `test:journee` (**30**) + `test:creneaux` (**7**) + `test:loyalty`
(**13**) + `test:referral` (**16**), voir `scripts/`. Certains rendus visuels
restent à confirmer sur le téléphone.

---

## Avancement vs cadrage

| | État |
|---|---|
| **V1** (bot client + base + Mini App admin) | ✅ 100 % |
| **V2** | ~95 % — reste le paiement/pourboire au checkout |
| **Mini App client** (vitrine) | ✅ livrée — cf. section dédiée |
| **Hébergement 24/7** | ✅ en production sur Oracle Cloud ([`deploiement.md`](./deploiement.md)) |
| **Plus tard** | non commencé (normal) |

**17 briques livrées** (historique plus bas). Bonus au-delà du plan : tournées
récurrentes + choix du créneau client, prix par taille, images produits, suivi de
tournée en direct.

**Manques V2** : mode de paiement (espèces / carte) + pourboire au checkout.
**Transverse non fait** : RGPD, gestion de stock. *(Hébergement 24/7 : fait, cf.
[`deploiement.md`](./deploiement.md).)*

---

## État actuel — ce qui est livré

### Bot client (Telegram)

| Fonction | Détail |
|---|---|
| Navigation | `/start` → catégories → produits → détail, inline keyboards, `editMessageText` (un seul message qui se met à jour), `answerCbQuery()` systématique |
| `callback_data` | Structurées (`nav:cat:…`, `cart:add:…`, `cart:addv:…`, `order:start`, `slot:…`) + **un seul** listener générique par regex |
| Panier | En mémoire (`src/cart.ts`), clé de ligne `catId:prodId:variantId`. **Modifiable ligne par ligne** (➖ / ➕ / 🗑) depuis l'écran panier. |
| Ajout au panier | Scene `quantity` (BaseScene), validation 1–99 |
| Checkout | Scene `checkout` (WizardScene, **5 étapes**) : adresse → téléphone → créneau → **précision de livraison** (étage, code — optionnelle) → confirmation. Adresse / numéro / précision de la dernière commande proposés en un clic. Commande créée déjà rattachée à sa tournée. |
| Produit devenu indisponible | À la validation, `reconcileCart()` relit le menu (frais) : les articles retirés / re-tarifés sont signalés au client, qui repasse par le récap avant de valider |
| Tailles / variantes | Si un produit a des tailles → un bouton par taille (prix propre) avant la quantité |
| Images | Produit avec photo → affiché en message image + légende (le message précédent est remplacé) |
| Notifications sortantes | Le bot écrit au client sur événement admin (statut, tournée) — **bot bidirectionnel** |
| Commandes | `/panier`, `/mes_commandes`, `/id`, `/help` ; publiées via `setMyCommands` (menu ☰) |

### Mini-admin dans le bot

- `/admin` → tableau de bord (compteurs par statut) + commandes en cours avec boutons.
- Transitions : `pending → confirmed → delivering → delivered` (+ annulation à chaque étape).
- `changeStatus()` (`src/orderFlow.ts`) = **point de passage unique** : valide la transition,
  met à jour la base, notifie le client. Réutilisé par la Mini App, le bot et les tournées.

### Mini App admin (React, `web/`)

Servie par le serveur HTTP du bot (même process). Auth = validation de l'`initData`
Telegram (HMAC-SHA256) + vérification `ADMIN_IDS` + `auth_date` < 24 h. Ouverte via le
bouton menu de la conversation admin ou le bouton dans `/admin`.

- **Commandes** : **tableau de bord** en tête (commandes / livrées / encaissé du jour,
  alerte « ⏰ N commandes en attente depuis +20 min » cliquable, avancement des tournées
  en cours), puis liste, filtres, détail, changement de statut, **modification de la
  commande** (`pending` / `confirmed` : articles, adresse, créneau, précision — total
  recalculé), téléphone cliquable, message libre au client (avec **modèles** insérables
  + gérables sur place), créneau et précision de livraison affichés.
- **Tournées** : modèles de créneaux récurrents (15:00 / 18:00 / 21:00 par défaut),
  tournées ponctuelles, affectation / retrait de commandes, **ordre de livraison
  réordonnable** (▲▼), démarrer / terminer, supprimer. Pendant une tournée : par
  commande, **📦 Livrée** (livre + notifie les 3 clients suivants de leur position :
  « tu es le prochain », « plus qu'un arrêt »…) ou **❌ Souci** (annulation + raison
  + flag no-show).
- **Catalogue** : catégories + produits + **tailles** + **photo**, activer / désactiver,
  ajouter / modifier / supprimer. Le bot voit les changements immédiatement (même
  process → cache `getMenu()` invalidé à chaque écriture).
- **Clients** : liste + recherche, fiche (nom, note de livraison, notes admin,
  historique de commandes), **taux de fiabilité calculé** (livrées vs no-show),
  liste noire (blocage). Un client bloqué / à risque est signalé en rouge sur ses
  commandes et dans la notification admin — la commande passe quand même (filtrage
  silencieux, l'admin décide).

### Base de données (SQLite, `data/bot.db`, WAL)

| Table | Colonnes |
|---|---|
| `orders` | id, user_id, username, phone, items (JSON — photo figée), address, total, status, route_id, route_position, delivery_note, cancellation_reason, no_show, created_at, updated_at, delivered_at, alerted |
| `categories` | id, label, position |
| `products` | id, category_id (FK CASCADE), name, description, price, available, image, position |
| `product_variants` | id, product_id (FK CASCADE), label, price, available, position |
| `routes` | id, date, time_slot, slot_time, template_id (FK SET NULL), max_capacity, status, created_at |
| `route_templates` | id, label, time (HH:MM), max_capacity, active, position |
| `sessions` | key (PK), scene, data (JSON), updated_at — état temporaire, **jamais** une donnée métier |
| `customers` | user_id (PK), username, name, phone, address, delivery_note, notes (admin), blocked, first_seen, updated_at |
| `message_templates` | id, label, content, position — réponses pré-écrites de l'admin |

Migrations : `CREATE TABLE IF NOT EXISTS` + helper `ensureColumn` (ALTER additif) dans
`src/db.ts`. Seed au 1er démarrage : catalogue depuis `menu.json`, 3 modèles de tournées.

### Sessions persistées (`src/sessionStore.ts`)

Store telegraf adossé à SQLite : un checkout en cours **survit à un redémarrage** du bot.
Trois mécanismes de nettoyage (cadrage) :
1. **sortie de scene** → `set()` reçoit une session vide → la ligne est supprimée ;
2. **TTL à la lecture** → `get()` ignore et supprime une session inactive depuis
   > `SESSION_TTL_MINUTES` (60) ;
3. **purge planifiée** → `purgeSessions()`, appelée à chaque tick du planificateur.

TTL mesuré sur `updated_at` (dernière activité), pas `created_at` — pour ne pas couper
un client au milieu d'un checkout.

### Planificateur (`src/scheduler.ts`)

- **toutes les heures** : matérialise les tournées J / J+1, purge les sessions ;
- **toutes les 5 min** : signale à l'admin les commandes `pending` depuis plus de
  `PENDING_ALERT_MINUTES` (20), une seule alerte par commande (`orders.alerted`).

### Images (`src/uploads.ts`)

Fichiers dans `data/uploads/` (ignoré par git). La Mini App redimensionne l'image côté
client (canvas, max 1024 px, JPEG ~0.82) et l'envoie en data URL base64 ; le serveur
décode, valide (jpeg/png/webp, < 6 Mo) et écrit. Servi par Express en `/uploads/…`. Le
bot envoie la photo depuis le disque (`replyWithPhoto({ source })`) — pas besoin d'URL
publique. Suppression d'un produit / d'une catégorie → les fichiers image sont effacés.

---

## Historique des briques

1. **Bot client** — navigation menu + panier mémoire + scene quantité. *(menu.json + `src/menu.ts`, remplacé plus tard.)*
2. **Checkout + SQLite** — WizardScene adresse / téléphone / confirmation, table `orders`, `/mes_commandes`.
   - Correction demandée : retrait du bouton `request_contact`, saisie manuelle du numéro.
3. **Mini-admin dans le bot** — `/admin`, `changeStatus()`, notifications client → bot bidirectionnel.
4. **Pré-remplissage checkout** — réutiliser la dernière adresse / le dernier numéro (`getLastOrder`).
5. **`setMyCommands`** — peupler le menu ☰ de Telegram (+ `removeKeyboard` sur `/start`).
6. **Mini App admin** — livrée en 3 paliers :
   - Palier 1 : serveur Express dans le process du bot, auth `initData`, onglet Commandes.
   - Palier 2 : catalogue en base (`src/menu.ts` → `src/catalog.ts`, seed depuis `menu.json`), onglet Catalogue CRUD.
   - Palier 3 : tournées (`src/routes.ts`), onglet Tournées, start/finish → statuts + notifs.
   - Vérifié e2e via l'API : `pending → confirmed → route start → delivering → route finish → delivered`, transition interdite → 409.
   - Durcissement sécurité : `verifyInitData` rejette tout `hash` mal formé.
7. **Tournées récurrentes + choix du créneau par le client** — `route_templates`, `src/scheduler.ts`, étape "créneau" dans le checkout, créneau affiché dans l'onglet Commandes.
8. **Prix par taille** — `product_variants`, `MenuItem.variants`, bouton par taille dans le bot, gestion dans l'onglet Catalogue.
9. **Images produits** — `src/uploads.ts`, `products.image`, `PhotoView` / `AnyView`, `render()` gère texte + photo (delete/resend dès qu'une photo est impliquée).
10. **Sessions persistées** — table `sessions`, `src/sessionStore.ts` (store SQLite pour telegraf), 3 mécanismes de nettoyage, purge branchée au planificateur.
11. **Clients + fiabilité** — table `customers` (`src/customers.ts`), `upsertCustomer` au checkout, taux de fiabilité **calculé** depuis `orders`, annulation avec raison + flag no-show, onglet Clients dans la Mini App, alerte client bloqué / à risque sur les commandes. `safeSend()` : "client injoignable" devient un warn, plus un stack trace.
*(2026-09-01 : `safeSend(..., { alertAdmins: true, context })` — un échec d'envoi
à un client remonte à l'admin dans le chat « ⚠️ Notification client non délivrée » ;
posé sur toutes les notifs client — statut, reçu, tournée, fidélité, parrainage,
modification. `test:client` : 19.)*
12. **Checkout V2** — modification du panier ligne par ligne (`setLineQty` / `removeLine`), étape « précision de livraison » (étage/code, pré-remplie depuis la fiche client), `reconcileCart()` à la validation (produit indispo / prix changé → signalé, retour au récap). `reloadMenu()` : la validation d'une commande relit toujours le menu frais.
13. **Suivi de tournée en direct** — extraction de `src/orderFlow.ts` (transitions + notifs, hors UI) pour casser le cycle admin ↔ routes. `orders.route_position` + réordonnancement (`moveOrder`). Pendant une tournée : **📦 Livrée** par commande → `markDelivered()` (livre + `notifyRouteProgress()` prévient les 3 clients suivants de leur position) ; **❌ Souci** → annulation + raison + no-show. Nouvelle transition `delivering → cancelled`.
14. **Tableau de bord + alertes** — `src/dashboard.ts` (`getDashboard`), `orders.updated_at` / `delivered_at` (posés dans `updateOrderStatus`). Carte tableau de bord en tête de l'onglet Commandes. Le planificateur alerte l'admin des commandes en attente depuis +20 min (`orders.alerted`, une fois).
15. **Templates de messages** — table `message_templates` (`src/messageTemplates.ts`, 4 modèles par défaut), API `/api/templates` (CRUD), composant `MessageTemplates` dans le détail commande : chips insérables + gestion inline (`⚙️ Modèles`).
16. **Modification d'une commande par l'admin** — `PATCH /api/orders/:id` (commande `pending` / `confirmed` uniquement, sinon 409). `updateOrderDetails()` (adresse, précision, articles → total recalculé), route via `setOrderRoute`. `catalog.resolveMenuItems()` : les articles sont re-tarifés au **prix courant** (le front n'envoie que des références). Option « prévenir le client ». `web/OrderEdit.tsx` : steppers de quantité, ajout depuis le catalogue, changement de créneau.
17. **Multi-livreurs** — sous-module `features.deliverySlots.drivers`. Table `drivers` (nom, tél, actif/position), `routes.driver_id` + `route_templates.driver_id` (livreur par défaut, recopié à la matérialisation). `src/drivers.ts` (CRUD, requêtes à la demande), `src/api/drivers.ts` (`/api/drivers`, monté si le sous-module est actif), `POST /api/routes/:id/driver`. Au démarrage d'une tournée, chaque client reçoit « 🛵 Ton livreur : X ». Mini App : panneau *Livreurs* + `<DriverSelect>` (nouvelle tournée / par tournée / par modèle), filtre « par livreur », livreur affiché dans le tableau de bord. +8 checks smoke.

---

## Modularisation — cœur + modules (en cours)

Plan en 6 étapes, cf. [`coeur-et-modules.md`](./coeur-et-modules.md). À chaque étape :
`npm run typecheck` + `npm run smoke` doivent rester verts, le client
pizzeria ne bouge pas.

1. ✅ **`src/features.ts`** — interface `ClientFeatures` + config pizzeria (comportement
   identique). Aucun autre fichier ne l'importe encore. *(commit `d52d2a4`)*
2. ✅ **`orders.address` / `orders.phone` nullables** — schéma : `TEXT` sans `NOT NULL`
   (bases fraîches ; les bases pizzeria existantes gardent le `NOT NULL`, SQLite ne
   sait pas le retirer par `ALTER`, sans effet car le checkout livraison fournit
   toujours les deux). Types : `NewOrder.phone?` / `.address?`, `OrderRow` /
   `Order` → `string | null`, `web/src/types.ts` idem. Consommateurs mis à null-safe
   (`renderOrderText`, `OrderDetail`, `OrderEdit`, `Routes`, `RouteOrderRow`,
   `Orders`). **Aucun changement de comportement du checkout.**
3. ✅ **Tables tournées conditionnelles** — `route_templates` + `routes` + leurs
   `ensureColumn` sortis du `db.exec` principal dans `createDeliveryTables()`,
   appelée seulement si `features.deliverySlots.enabled`. Pour un client retrait
   boutique, ces tables n'existent pas. *(La garde à l'import de `routes.ts` /
   `api/routes.ts` — requêtes préparées au chargement — est traitée à l'étape 5.)*
4. ✅ **`checkout.ts` piloté par `features.ts`** — chaînage `goToPhone/Slot/Note/
   Confirm`, chacun joue son étape ou saute directement à la suivante selon
   `requiresAddress` / `requiresPhone` / `deliverySlots.enabled` /
   `deliveryNote.enabled`. En-tête « Étape X/N » calculée depuis `FLOW`. Récap :
   lignes conditionnelles + ligne Paiement dérivée de `fulfillment` /
   `payment.methods` (identique pour la pizzeria). `upsertCustomer` accepte
   `phone`/`address` optionnels.
5. ✅ **`GET /api/features` + Mini App adaptative** — endpoint (auth admin) qui
   renvoie `features`. `/api/routes` monté seulement si `deliverySlots.enabled` ;
   `routes.ts` prépare ses requêtes à la demande (`buildStatements()` + `q()`),
   `dashboard.ts` idem pour `activeRoutes` ; `scheduler.ts` / `index.ts` gardés.
   Front : `FeaturesContext` chargé une fois par `App`, onglets Tournées /
   Clients conditionnels (`deliverySlots` / `reliability`), libellé variantes =
   `features.variants.label`. +2 checks smoke (`/api/features`).
6. ✅ **Validation de l'hypothèse** — `src/features.ts` devient un registre
   (`CLIENT_ID`, défaut `pizzeria`) + entrée `boutique-demo` (retrait, sans
   tournées, sans fiabilité). `db.ts` accepte `DB_PATH`. `index.ts` charge
   `dotenv` avant `db` / `features`. `scripts/boutique.mts` (`npm run
   test:boutique`, **15/15**) : parcours complet catalogue → panier → commande
   sans adresse → `renderOrderText` → dashboard, **base isolée, sans toucher
   `catalog.ts` / `cart.ts` / `orderFlow.ts`**. Seuls fichiers modifiés pour ce
   client : `features.ts` (une entrée de registre).

**Chantier « cœur + modules » terminé.** Adapter un nouveau métier = ajouter une
entrée à `src/features.ts` + `web/`.

---

## Refactoring du cœur — [`feuille-de-route.md`](./feuille-de-route.md) Partie 2

Objectif : réduire le cœur au socle incompressible.

1. ✅ **Fiabilité extraite** — `src/modules/reliability.ts` (calcul + `listReliability`
   batch). `customers.ts` = fiche minimale. `orderFlow.customerFlag()` consulte
   `features.reliability.enabled`. `reliability` nullable dans les DTO / le front.
   *(commit `90a2bdc`)*
2. ✅ **Messages pré-écrits conditionnels** — flag `messaging.templatesEnabled`.
   Table `message_templates`, `/api/templates`, seed et bloc chips Mini App montés
   seulement si actif. `messageTemplates.ts` en requêtes à la demande. *(commit `6e0571d`)*
3. ✅ **Textes en dur de `views.ts`** — « taille » → `features.variants.label`.
   `catalog.getMenu()` masque les variantes si `!features.variants.enabled`
   (`listCatalog` admin non touché). `boutique-demo` = config « tout module off ».
   *Déviation assumée : `catalog.ts` / `views.ts` lisent `features.ts`.* *(commit `2da8914`)*
4. ✅ **Machine à états paramétrable** (4 phases). `features.orderFlow` = liste
   d'étapes à rôle sémantique (`placed / accepted / fulfilling / fulfilled /
   cancelled`). `src/orderStages.ts` (helpers + `validateOrderFlow`), transitions
   générées, `OrderStatus = string`, Mini App via `useFlow()` / `/api/features`.
   `boutique-demo` tourne en `pending → confirmed → ready → collected`.
   Pizzeria strictement inchangée (smoke 66, journee 30 · 290 €).

**Refactoring du cœur terminé.** Cœur = `catalog.ts` (– lecture `variants`),
`cart.ts`, `orders.ts`, `sessionStore.ts`, `views.ts` (– `variants.label`),
`callbacks.ts`, `scenes/quantity.ts`, `api/auth.ts` + les nouveaux
`src/orderStages.ts` (config), `src/modules/*`.

---

## Nouveaux modules — [`feuille-de-route.md`](./feuille-de-route.md) Partie 3

- ✅ **Créneaux à capacité limitée** — flag `deliverySlots.capacityLimit`
  (défaut du client, `null` = illimité ; une capacité posée sur une tournée
  reste prioritaire). `getAvailableSlots()` renvoie `Slot.remaining` (affiché
  dès ≤ 3), `hasUpcomingSlots()` distingue « aucun créneau » de « tous complets ».
  Mini App : `n / max — complet` sur la carte tournée. `npm run test:creneaux`.
- ✅ **Programme de fidélité** — flags `loyalty.*`, table séparée `loyalty`,
  module `src/modules/loyalty.ts`. Points crédités au rôle `fulfilled` (via
  `changeStatus`), notif client au palier. Bot `/fidelite` + ligne récap ;
  admin : flag sur la commande + bouton « Utiliser une récompense » sur la fiche
  client. `boutique-demo` activé (viennoiserie / 10). `npm run test:loyalty`.
- ✅ **Parrainage** — flags `referral.*`, table `referrals`, module
  `src/modules/referral.ts`. Code = `user_id` en base 36. `/parrainage [code]`.
  Réduction appliquée dans `checkout.ts` (`orders.referral_discount`) — **cart.ts
  intact**. Filleul −X à la 1re commande → crédit parrain (notif) consommé ensuite.
  `boutique-demo` : 5 €/5 €. `npm run test:referral`.
- ⏸ Notifications marketing (bloqué : règles Telegram à vérifier)

---

## Mini App client — la vitrine

Plan : [`mini-app-client.md`](./mini-app-client.md). Simulation validée (« Le parcours
de Léa »). **9 étapes livrées** (`npm run test:client` : **18**).

Le cadrage acte enfin la vraie répartition : le **bot** reste sobre (notifications +
parcours texte de repli), la **vitrine riche = une Mini App client** dans `web/`, et
le **panier est partagé** entre les deux — une seule source de vérité.

| # | Étape | Livré |
|---|---|---|
| 1 | **Panier en base** | table `cart` (`db.ts`), `src/cart.ts` réécrit `Map` → SQLite, stocke des **références** résolues à la lecture (`getMenu()`) → un produit retiré disparaît du panier tout seul. Purge des paniers abandonnés au planificateur. |
| 2–3 | **`createClientOrder` + API `/api/shop/*`** | `src/order.ts` : logique de commande **pure** (reconcile + `createOrder` + `upsertCustomer` + parrainage), appelée par la scène du bot **et** l'endpoint. `src/api/shop.ts` (auth `requireUser` = initData valide sans contrôle admin) : `menu`, `cart` CRUD, `slots`, `last-order`, `orders` (historique), `POST /orders` (checkout → reçu bot + `notifyNewOrder`), `POST /cart/reorder`. |
| 4 | **Split `web/`** | `App.tsx` = routeur : `GET /api/features` → 200 `<AdminApp>` / 403 `<ClientApp>`. `?view=client` force la vitrine même pour un admin. |
| 5 | **Catalogue → produit → panier** | `web/src/client/` : `Catalog`, `Product`, `Cart`. Registre visuel plus doux que l'admin (cartes rondes, photos), même `--accent`. Placeholder sans photo = emoji de la catégorie. `MainButton` / `BackButton` natifs Telegram (`client/hooks.ts`). |
| 6 | **Checkout client** | `Checkout.tsx` (adresse / tél / créneau / précision, champs pilotés par la config, pré-remplissage via `/shop/last-order`) → `POST /api/shop/orders` → le bot envoie le reçu dans le chat. `OrderSent.tsx` (confirmation, `WebApp.close()`). Le parcours texte du bot reste pour le repli. |
| 7 | **Historique + « recommander »** | `Orders.tsx` (statut, articles, date, total) ; `POST /api/shop/cart/reorder` re-remplit le panier depuis une commande passée (ignore les articles retirés du menu). |
| 8 | **Ouverture depuis le bot** | bouton inline `web_app` « 🛍️ Ouvrir la boutique » sur l'accueil et le panier (`src/views.ts` `shopButtonRow`, si `WEBAPP_URL` définie), URL `?view=client`. Panier partagé → bascule bot ↔ Mini App sans rien reperdre. |
| 9 | **Polish** | états chargement / erreur / vides unifiés (`.shop-state`), `useNoMainButton()`, thème clair **et** sombre Telegram vérifiés. |

Preview des écrans client hors Telegram : `npm run preview:client` → `http://localhost:3000/_client-preview.html`.

Reste possible : `POST /api/shop/orders/:id/items` (ajout à une commande en cours, parcours de Léa étape 10).

---

## Environnement de développement (spécifique à cette machine)

- **Node.js v22.20.0** installé en portable dans `%LOCALAPPDATA%\Programs\nodejs`
  (l'installeur MSI winget exigeait une élévation UAC indisponible). Ajouté au PATH
  utilisateur.
- **cloudflared** binaire portable dans `%LOCALAPPDATA%\Programs\cloudflared` (+ PATH).
  *(Servait au tunnel HTTPS de dev ; la prod n'en dépend plus — cf. [`deploiement.md`](./deploiement.md).)*
- Aucun accès administrateur Windows requis.
- `npm install` échouait sous le bac à sable de Claude Code (EPERM sur `E:\`) — les
  commandes npm/node ont été lancées hors sandbox.
- Réseau vers npmjs très lent (l'install de `web/` a pris ~24 min).

---

## Préparation du pilote (2026-09-01)

Passe avant d'ouvrir à de vrais clients :

- **Alerte admin sur notif client échouée** — `safeSend(..., { alertAdmins: true,
  context })` : un échec d'envoi à un client remonte à l'admin dans le chat
  (« ⚠️ Notification client non délivrée »), posé sur toutes les notifs client.
- **Motif d'annulation transmis au client** (« Motif : rupture de stock ») au lieu
  du générique. Divers textes client resserrés (bot + Mini App).
- **`/contact` + « ☎️ Nous contacter »** — coordonnées (`features.contact`) +
  **relais de messagerie** : « 💬 Écrire à la boutique » → message transmis à
  l'admin → bouton « Répondre » (`src/support.ts`, scenes `support` /
  `support-reply`). Aussi un pied de page contact sur la Mini App client.
- **`SEED_DEMO_CATALOG=0`** — en prod, `seedCatalogIfEmpty()` ne réinjecte plus
  `menu.json` : catalogue vierge, à saisir dans la Mini App admin.

`test:boutique` : 32, `test:journee` : 31, `test:client` : 19. Déployé.

## Ce qui reste

### V2 pas encore fait
- Choix explicite du mode de paiement au checkout (aujourd'hui : affiché, pas choisi) ;
  pourboire optionnel

### Multi-livreurs — évolutions possibles (brique 17 = liste + affectation)
- Vue Telegram par livreur (`/matournee`, ne voit que ses commandes, marque les
  livraisons) — cadrage : « plus tard ».
- Disponibilité / planning des livreurs, répartition semi-auto.

### Transverse
- ~~Hébergement 24/7~~ → **fait** : VM Oracle Cloud, [`deploiement.md`](./deploiement.md).
  Reste : réserver l'IP publique, envisager un vrai nom de domaine.
- **RGPD** — mécanisme de suppression des données personnelles sur demande.
- **Gestion de stock** — jamais abordée (alerte seuil bas, rupture).
- **Optimisations images** — cache du `file_id` Telegram après le premier envoi.

Reste de la roadmap « plus tard » : voir [`cadrage.md`](./cadrage.md).
