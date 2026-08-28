# Journal d'avancement

État du projet et historique des briques livrées (développées les 27–28 août 2026).
Pour le "pourquoi" des choix, voir [`cadrage.md`](./cadrage.md).

> Dernière mise à jour : 2026-08-28, après la brique 16.

Bot de test : **@Testshopa1bot** (token dans `.env`, non commité).
`ADMIN_IDS=786545252` (compte de l'utilisateur).

Vérification : `npm run typecheck` (0 erreur) + `npm run smoke` (**56 checks OK**,
voir `scripts/`). Certains rendus visuels restent à confirmer sur le téléphone.

---

## Avancement vs cadrage

| | État |
|---|---|
| **V1** (bot client + base + Mini App admin) | ✅ 100 % |
| **V2** | ~90 % — il ne reste que 2 points |
| **Plus tard** | non commencé (normal) |

**16 briques livrées** (historique plus bas). Bonus au-delà du plan : tournées
récurrentes + choix du créneau client, prix par taille, images produits, suivi de
tournée en direct.

**Manques V2** : mode de paiement (espèces / carte) + pourboire au checkout ;
`routes.driver_name` (multi-livreurs).
**Transverse non fait** : RGPD, hébergement 24/7, gestion de stock.

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
12. **Checkout V2** — modification du panier ligne par ligne (`setLineQty` / `removeLine`), étape « précision de livraison » (étage/code, pré-remplie depuis la fiche client), `reconcileCart()` à la validation (produit indispo / prix changé → signalé, retour au récap). `reloadMenu()` : la validation d'une commande relit toujours le menu frais.
13. **Suivi de tournée en direct** — extraction de `src/orderFlow.ts` (transitions + notifs, hors UI) pour casser le cycle admin ↔ routes. `orders.route_position` + réordonnancement (`moveOrder`). Pendant une tournée : **📦 Livrée** par commande → `markDelivered()` (livre + `notifyRouteProgress()` prévient les 3 clients suivants de leur position) ; **❌ Souci** → annulation + raison + no-show. Nouvelle transition `delivering → cancelled`.
14. **Tableau de bord + alertes** — `src/dashboard.ts` (`getDashboard`), `orders.updated_at` / `delivered_at` (posés dans `updateOrderStatus`). Carte tableau de bord en tête de l'onglet Commandes. Le planificateur alerte l'admin des commandes en attente depuis +20 min (`orders.alerted`, une fois).
15. **Templates de messages** — table `message_templates` (`src/messageTemplates.ts`, 4 modèles par défaut), API `/api/templates` (CRUD), composant `MessageTemplates` dans le détail commande : chips insérables + gestion inline (`⚙️ Modèles`).
16. **Modification d'une commande par l'admin** — `PATCH /api/orders/:id` (commande `pending` / `confirmed` uniquement, sinon 409). `updateOrderDetails()` (adresse, précision, articles → total recalculé), route via `setOrderRoute`. `catalog.resolveMenuItems()` : les articles sont re-tarifés au **prix courant** (le front n'envoie que des références). Option « prévenir le client ». `web/OrderEdit.tsx` : steppers de quantité, ajout depuis le catalogue, changement de créneau.

---

## Environnement de développement (spécifique à cette machine)

- **Node.js v22.20.0** installé en portable dans `%LOCALAPPDATA%\Programs\nodejs`
  (l'installeur MSI winget exigeait une élévation UAC indisponible). Ajouté au PATH
  utilisateur.
- **cloudflared** binaire portable dans `%LOCALAPPDATA%\Programs\cloudflared` (+ PATH).
- Aucun accès administrateur Windows requis.
- `npm install` échouait sous le bac à sable de Claude Code (EPERM sur `E:\`) — les
  commandes npm/node ont été lancées hors sandbox.
- Réseau vers npmjs très lent (l'install de `web/` a pris ~24 min).

---

## Ce qui reste

### V2 pas encore fait
- `routes.driver_name` (multi-livreurs)
- Choix explicite du mode de paiement au checkout (aujourd'hui : affiché, pas choisi) ;
  pourboire optionnel

### Transverse
- **Hébergement 24/7** — pour ne plus dépendre du tunnel cloudflared éphémère
  (l'URL change à chaque redémarrage → re-renseigner `WEBAPP_URL` et relancer le bot).
- **RGPD** — mécanisme de suppression des données personnelles sur demande.
- **Gestion de stock** — jamais abordée (alerte seuil bas, rupture).
- **Optimisations images** — cache du `file_id` Telegram après le premier envoi.

Reste de la roadmap « plus tard » : voir [`cadrage.md`](./cadrage.md).
