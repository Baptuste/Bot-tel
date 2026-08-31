# Mini App client — plan du chantier

> À lire après [`cadrage.md`](./cadrage.md) et [`chantier-rendu.md`](./chantier-rendu.md).
> Vision illustrée : artefact **« Le parcours de Léa »**
> (https://claude.ai/code/artifact/db398e4f-84a6-4647-8890-4dcbd07bbe13).

## But

Ajouter une **surface client** dans la Mini App `web/` existante : catalogue avec
photos, panier, checkout. Elle **partage le panier et les commandes** avec le bot
via la base — une seule source de vérité. Le bot reste le canal de notifications
et le parcours de repli.

Répartition (celle du cadrage, enfin réalisée) :

| | Rôle |
|---|---|
| **Bot** | `/start`, notifications de statut, reçu, « recommander », parcours texte de repli |
| **Mini App client** | la vitrine : catégories/photos, panier confortable, checkout |
| **Mini App admin** | inchangée |

## Principe technique : une base, deux fenêtres

- Le serveur HTTP tourne **dans le process du bot** (`src/server.ts`) → même base
  SQLite, mêmes modules métier. Rien à synchroniser.
- Le **panier** passe de la `Map` mémoire (`src/cart.ts`) à une **table**. Le bot
  et la Mini App lisent/écrivent la même chose.
- Le panier stocke des **références** (`cat / prod / variant / qty`), pas des
  libellés figés. `getCart()` re-résout le libellé et le prix depuis le menu
  courant à chaque lecture → un article retiré du catalogue disparaît du panier
  tout seul (cf. parcours de Léa, étape 6). `catalog.resolveMenuItems()` fait
  déjà cette résolution (utilisé par l'éditeur de commande admin).

## Les 4 briques

### Brique 1 — Panier en base

- Table `cart(user_id, cat_id, prod_id, variant_id, qty, added_at)`, unique sur
  `(user_id, cat_id, prod_id, variant_id)`. Migration additive (`db.ts`).
- `src/cart.ts` : requêtes préparées au lieu de la `Map`. **Interface exportée
  identique** (`getCart / addToCart / setLineQty / removeLine / clearCart /
  cartTotal / lineKey`) → les vues et scènes du bot ne changent pas.
  - `addToCart(userId, ref, qty)` — la signature perd `label` / `price`
    (résolus à la lecture). Petit ajustement dans `scenes/quantity.ts` et
    `callbacks.ts`.
  - `reconcileCart` — largement obsolète (le panier se nettoie tout seul) ;
    on garde une version qui **rapporte** ce qui a changé, pour l'afficher au
    récap du checkout.
- Purge des paniers abandonnés : TTL + tâche planifiée, comme les sessions
  (`scheduler.ts`).

### Brique 2 — `createClientOrder` : logique de commande partagée

Aujourd'hui la création de commande est **collée à la scène telegraf**
(`scenes/checkout.ts`, handler `order:confirm`). On extrait le cœur dans
`src/order.ts` :

```
createClientOrder({ userId, username, address?, phone?, routeId?, deliveryNote? })
  -> reconcile + createOrder + upsertCustomer + parrainage
  -> { orderId, status, warnings }
```

Appelé **par la scène du bot ET par l'endpoint API**. Supprime la duplication.

### Brique 3 — Endpoints client

- `src/api/auth.ts` : ajouter `requireUser` (valide l'`initData`, remplit
  `req.tgUser`, **pas** de contrôle `ADMIN_IDS`).
- `src/api/shop.ts` (nouveau routeur) :

  | Route | Rôle |
  |---|---|
  | `GET /api/shop/menu` | `getMenu()` + sous-ensemble de `features` utile au client (libellé variantes, `fulfillment`, `deliverySlots`, `payment`, flags loyalty/referral) |
  | `GET /api/shop/cart` | lignes résolues + total |
  | `POST /api/shop/cart` | ajouter `{ catId, prodId, variantId?, qty }` |
  | `PATCH /api/shop/cart` | `setLineQty` / `removeLine` |
  | `DELETE /api/shop/cart` | vider |
  | `GET /api/shop/slots` | `getAvailableSlots()` (si créneaux actifs) |
  | `GET /api/shop/last-order` | pré-remplissage adresse / tél / précision |
  | `POST /api/shop/orders` | checkout → `createClientOrder` → le bot envoie le reçu au client (`bot.telegram.sendMessage`) + notifie l'admin (`notifyNewOrder`) |
  | `GET /api/shop/orders` | historique du client (statuts) |
  | `POST /api/shop/orders/:id/items` | ajouter à une commande `pending` / `confirmed` (parcours de Léa, étape 10) — réutilise `updateOrderDetails` |

### Brique 4 — Ouverture depuis le bot

- Boutons `web_app` inline dans `/start` et l'écran panier (« 🍕 Ouvrir la carte »).
  URL = `WEBAPP_URL` (même Mini App, mode détecté).
- Optionnel : `setChatMenuButton` par utilisateur à la première `/start`.

## La Mini App client elle-même (le gros du travail)

- `web/src/App.tsx` devient un routeur : au chargement, tenter `GET /api/features`
  (ou un `/api/me`) → **200 = admin**, **403 = client**. Brancher `<AdminApp/>`
  ou `<ClientApp/>`. Les composants admin actuels ne bougent pas (regroupés).
- `web/src/client/` : `Catalog` (catégories → produits, photos), `Product`
  (photo, description, taille, quantité), `Cart` (± par ligne, total),
  `Checkout` (adresse/tél/créneau/précision pré-remplis), `OrderSent`
  (confirmation + `WebApp.close()`), `Orders` (historique + statut + « recommander »).
- Intégration native : `MainButton` (« Commander · 27 € »), `BackButton`,
  thème Telegram, `HapticFeedback`.
- Design : c'est **ici** qu'on pousse le visuel (photos, mise en page confortable).

## Décision : le checkout se fait **dans la Mini App**

Pas de reprise de la Wizard telegraf depuis un webview. Formulaire dans la Mini
App → `POST /api/shop/orders` → le bot envoie le reçu dans le chat. Le parcours
texte du bot (`scenes/checkout.ts`) reste pour le repli, inchangé.

## Ordre de travail (étapes testables)

| # | Étape | Test |
|---|---|---|
| 1 | Table `cart` + `cart.ts` sur la base | `smoke` + parcours bot manuel inchangé |
| 2 | Extraire `createClientOrder` (bot l'utilise) | bot inchangé |
| 3 | `requireUser` + `/api/shop/*` | `scripts/client.mts` (initData forgé, base isolée) |
| 4 | Split `web/` : routeur, `ClientApp` vide, admin intact | admin Mini App inchangée |
| 5 | UI client : catalogue → produit → panier | screenshot par écran |
| 6 | Checkout client → commande → reçu bot | e2e via `client.mts` + test Telegram |
| 7 | Historique + « recommander » | `client.mts` |
| 8 | Boutons d'ouverture dans le bot | test Telegram |
| 9 | Polish : `MainButton`, thème, états vides | — |

## Ce qui ne change pas

`orderFlow.ts`, `features.ts` (flags), la Mini App admin, le schéma
`orders / routes / customers`, `getMenu()`, `catalog.ts`, les étapes de statut,
les notifications. Seuls ajouts : table `cart`, `src/order.ts`, `src/api/shop.ts`,
`web/src/client/`.

## Risques / points d'attention

- **Panier en références** : une ligne pour un produit supprimé doit disparaître
  proprement (silencieux + info au client au moment du récap).
- **Hébergement 24/7** : une surface *client* sur un tunnel cloudflared éphémère,
  c'est pire qu'une surface admin. À traiter avant une vraie mise en service.
- **Split `web/`** : restructuration minimale — `App.tsx` branche, on ne déplace
  pas des fichiers pour le plaisir.
- **`scripts/client.mts`** : nouveau script de simulation (comme `boutique.mts`),
  base isolée, parcours complet catalogue → panier → commande via l'API.
