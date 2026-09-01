# Bot Tel

Bot Telegram d'une petite boutique de livraison + **Mini App admin & client**.
En production sur une VM Oracle Cloud — [`docs/deploiement.md`](docs/deploiement.md).

**Documentation** :
- [`docs/cadrage.md`](docs/cadrage.md) — cadrage initial (le pourquoi, roadmap V1/V2)
- [`docs/avancement.md`](docs/avancement.md) — état réel du projet, historique des briques
- [`docs/coeur-et-modules.md`](docs/coeur-et-modules.md) — direction : cœur générique + modules par client
- [`docs/feuille-de-route.md`](docs/feuille-de-route.md) — refactoring du cœur + nouveaux modules (fidélité, parrainage, créneaux à capacité…)
- [`docs/mini-app-client.md`](docs/mini-app-client.md) — la vitrine client (catalogue photos, panier partagé, checkout)
- [`docs/deploiement.md`](docs/deploiement.md) — mise en production (Oracle Cloud, systemd, Caddy)

Ce README couvre l'architecture et l'installation.

## Parcours client

- `/start` -> navigation **categories -> produits -> detail** en inline keyboards
  (un seul message qui se met a jour via `editMessageText` ; un produit avec photo
  s'affiche en message image et remplace le message precedent) ;
- ajout au panier **avec quantite** (scene telegraf) ;
- **recapitulatif** du panier + **modification ligne par ligne** (- / + / supprimer) ;
- **checkout** dont les etapes dependent de `src/features.ts` : adresse ->
  telephone -> **creneau** -> **precision de livraison** (etage/code) ->
  confirmation. Chaque etape desactivee est sautee et l'entete "Etape X/N" se
  recalcule. Commande **persistee** (SQLite), deja rattachee a sa tournee, panier
  vide. Adresse / numero / precision de la derniere commande proposes en un clic.
  A la validation, les produits devenus indisponibles / re-tarifes sont signales
  avant de confirmer ;
- `/mes_commandes` : historique client (lecture simple) ;
- **Mini App client** (vitrine) : bouton inline « 🛍️ Ouvrir la boutique » →
  catalogue photos, panier **partagé avec le bot** (table `cart`), checkout complet,
  historique + « recommander ». Le parcours texte du bot reste comme repli. Voir
  [`docs/mini-app-client.md`](docs/mini-app-client.md) ;
- **mini-admin dans le bot** : `/admin` (tableau de bord + boutons de transition de
  statut). Chaque changement de statut **notifie le client** (le bot devient bidirectionnel) ;
- **Mini App admin** (React, `web/`) servie par le serveur HTTP du bot. Auth =
  validation de l'`initData` Telegram (HMAC) + verification `ADMIN_IDS`. Les onglets
  affiches dependent de `src/features.ts` (Tournees si `deliverySlots`, Clients si
  `reliability`), via `GET /api/features` :
  - *Commandes* : **tableau de bord** (CA du jour, alertes commandes en attente, tournees
    en cours) + liste, filtres, detail, changement de statut, **modification de la commande**
    (articles / adresse / creneau), tel cliquable, message libre (+ modeles) ;
  - *Tournees* : **modeles de creneaux recurrents** (15:00 / 18:00 / 21:00 par defaut,
    materialises chaque jour par `src/scheduler.ts`), tournees ponctuelles, affectation
    des commandes, **ordre de livraison reordonnable**, demarrer / terminer. Pendant la
    tournee : par commande, **Livree** (notifie les 3 clients suivants de leur position)
    ou **Souci** (annulation + raison). **Multi-livreurs** (si `deliverySlots.drivers`) :
    liste de livreurs, affectation par tournee / par modele, filtre, notif client
    « ton livreur : X » au demarrage ;
  - *Catalogue* : categories + produits + **tailles/variantes** (prix par taille)
    + **photo** (redimensionnee cote client, servie en `/uploads/`), activer/desactiver,
    ajouter/modifier/supprimer (le bot voit les changements immediatement : meme
    process -> cache invalide) ;
  - *Clients* (si `reliability`) : liste + recherche, fiche (nom, note de livraison, notes
    admin, historique), **taux de fiabilite calcule** (livrees vs no-show), blocage (liste
    noire). Annulation d'une commande = raison + case "imputer au client". Cartes
    **Fidelite** (points + bouton « utiliser une recompense ») et **Parrainage** (code,
    filleuls, credit) selon les modules actifs.

## Modules activables par client

Le comportement du bot est piloté par un seul objet, `src/features.ts` (registre
de clients, choisi par `CLIENT_ID`). Un module absent ne coûte rien à ce client
(ni table, ni requête, ni écran). Voir [`docs/coeur-et-modules.md`](docs/coeur-et-modules.md)
et [`docs/feuille-de-route.md`](docs/feuille-de-route.md).

| Module | Flag(s) | Rôle |
|---|---|---|
| Retrait / livraison | `fulfillment`, `requiresAddress`, `requiresPhone` | Étapes du checkout, schéma `orders` nullable |
| Tournées & créneaux | `deliverySlots.enabled` | Tables `routes` / `route_templates`, onglet Tournées, étape créneau |
| Multi-livreurs | `deliverySlots.drivers` | Table `drivers`, affectation par tournée, notif « ton livreur » |
| Créneaux à capacité | `deliverySlots.capacityLimit` | Plafond par défaut ; créneau plein retiré des choix, places restantes affichées |
| Précision de livraison | `deliveryNote.enabled` / `.label` | Étape « étage, code… » optionnelle |
| Variantes | `variants.enabled` / `.label` | Masque les variantes côté client ; libellé « Taille / Couleur… » |
| Messages pré-écrits | `messaging.templatesEnabled` | Table `message_templates`, `/api/templates`, chips admin |
| Fiabilité / no-show | `reliability.enabled` | `src/modules/reliability.ts` ; onglet Clients, ligne d'alerte admin |
| Fidélité | `loyalty.*` | Table `loyalty` ; points à la commande servie, `/fidelite`, récompense au palier |
| Parrainage | `referral.*` | Table `referrals` ; `/parrainage`, réduction filleul + crédit parrain |
| Machine à états | `orderFlow` | Pipeline de statuts défini en données (`src/orderStages.ts`) ; ex. retrait : `pending → confirmed → ready → collected` |

**État** : V1 complet, V2 ~95 %. Cœur dégraissé (fiabilité / messages / machine à
états sortis en modules). Modules Partie 3 faits : créneaux à capacité, fidélité,
parrainage. Reste : mode de paiement / pourboire au checkout ; notifications
marketing (bloqué : règles Telegram) ; transverse : hébergement 24/7, RGPD, stock.
Voir `docs/avancement.md` et `docs/feuille-de-route.md`.

## Lancer les Mini App (dev)

```powershell
npm run web:install     # 1re fois : dependances de web/
npm run build:web       # build de la Mini App -> web/dist (servie par le serveur Node)
npm run dev             # bot + serveur HTTP (port 3000)
npm run tunnel          # dans un 2e terminal : tunnel HTTPS cloudflared -> localhost:3000
```

Le tunnel affiche une URL `https://xxx.trycloudflare.com`. La copier dans `.env` :
`WEBAPP_URL=https://xxx.trycloudflare.com`, puis **relancer `npm run dev`**
(le bot y branche le bouton "menu" de la Mini App et les boutons `web_app`).

> L'URL du tunnel gratuit change a chaque redemarrage de cloudflared : il faut
> re-renseigner `WEBAPP_URL` et relancer le bot. **En production**, le serveur est
> heberge avec une URL stable — [`docs/deploiement.md`](docs/deploiement.md).

Preview des ecrans de la **Mini App client** sans Telegram :
`npm run preview:client` -> `http://localhost:3000/_client-preview.html`
(initData non-admin forge, bundle reel sur `/api/shop`).

## Architecture (le "pourquoi")

Donnees et logique sont **strictement separees**. Chaque brique = une table qui
se greffe sans reecrire l'existant.

| Fichier | Role |
|---|---|
| `src/features.ts` | **Config metier** du client actif (registre + `CLIENT_ID`). Pilote les etapes du checkout, les tables creees, les onglets de la Mini App. Seul fichier a toucher pour un nouveau metier. |
| `menu.json` (racine) | **Contenu initial** du catalogue : seme la base au 1er demarrage, plus utilise ensuite. |
| `data/bot.db` | Base SQLite locale (ignoree par git). Cree automatiquement au 1er lancement. |
| `src/catalog.ts` | Catalogue en base : `getMenu()` (menu filtre pour le bot) + CRUD (Mini App). |
| `src/uploads.ts` | Images produits sur disque (`data/uploads/`), decode base64 / suppression. |
| `src/db.ts` | Connexion SQLite (`DB_PATH`) + tables du cœur (`orders`, `categories`, `products`, `product_variants`, `sessions`, `customers`, `cart`) ; tables de module créées **seulement si le flag est actif** : `routes` / `route_templates` / `drivers` (`deliverySlots`), `message_templates` (`messaging`), `loyalty`, `referrals`. |
| `src/orders.ts` | Requetes sur `orders`. Une commande = donnee **definitive**. Statut = id d'étape (`string`). |
| `src/orderStages.ts` | Machine à états : helpers dérivés de `features.orderFlow` (rôles `placed / accepted / fulfilling / fulfilled / cancelled`), `validateOrderFlow()`. |
| `src/drivers.ts` | Livreurs (sous-module `deliverySlots.drivers`) : CRUD, affectation a une tournee. |
| `src/customers.ts` | Fiche client **minimale** (nom, tél, adresse, notes, blocage). **Cœur.** |
| `src/modules/reliability.ts` | Taux de fiabilité (livrées / no-show), calculé depuis `orders`. Module `reliability`. |
| `src/modules/loyalty.ts` | Points de fidélité (table `loyalty`), crédités au rôle `fulfilled`. Module `loyalty`. |
| `src/modules/referral.ts` | Parrainage (table `referrals`) : code = `user_id` base 36, réduction filleul + crédit parrain. Module `referral`. |
| `src/orderFlow.ts` | Cycle de vie d'une commande : `changeStatus()`, transitions **générées** depuis `features.orderFlow`, notifications client (hors UI). |
| `src/routes.ts` | Tournees + modeles de creneaux + suivi en direct (`markDelivered`, `notifyRouteProgress`). |
| `src/scheduler.ts` | Planificateur : tournees + purge sessions (horaire) + alerte commandes en attente (5 min). |
| `src/dashboard.ts` | Agregats du tableau de bord admin + detection des commandes en attente trop longtemps. |
| `src/messageTemplates.ts` | Modeles de messages pre-ecrits (module `messaging`, seed de 4 par defaut). |
| `src/sessionStore.ts` | Store de sessions telegraf sur SQLite (persistance + TTL + purge). **Cœur.** |
| `src/api/` | Routes Express : Mini App **admin** (`orders`, `catalog`, `customers`, `dashboard`, `features` + conditionnels `routes`, `drivers`, `templates`) ; Mini App **client** (`shop` — `/api/shop/*`) ; `auth` (`verifyInitData` + `requireUser`). |
| `src/cart.ts` | Panier **en base** (table `cart`), stocke des **references** (`cat/prod/variant/qty`) resolues a la lecture depuis `getMenu()`. Partage entre le bot et la Mini App client. Devient une ligne `orders` a la validation. **Cœur.** |
| `src/order.ts` | `createClientOrder()` : creation de commande **pure** (sans messagerie) — reconcile + `createOrder` + `upsertCustomer` + parrainage. Appelee par la scene checkout du bot **et** l'API de la Mini App client. |
| `src/api/shop.ts` | API de la **Mini App client** (`/api/shop/*`, auth `requireUser` = initData valide, pas forcement admin) : menu, panier, creneaux, historique, checkout, « recommander ». |
| `web/src/client/` | Vitrine client React : `Catalog`, `Product`, `Cart`, `Checkout`, `OrderSent`, `Orders`. `App.tsx` route admin/client selon `GET /api/features` (`?view=client` force la vitrine). |
| `src/views.ts` | Transforme (menu, panier) en `{ text, keyboard }`. N'envoie rien. Libellé variantes depuis `features.ts`. |
| `src/callbacks.ts` | `callback_data` structurees (`nav:cat:pizzas`...) + parsing. Un seul listener generique. |
| `src/scenes/quantity.ts` | Scene simple (BaseScene) : attend une quantite. |
| `src/scenes/checkout.ts` | WizardScene : adresse -> tel -> creneau -> precision -> confirmation (etapes sautees selon `features.ts`, + reconcile panier). |
| `src/admin.ts` | Mini-admin : `/admin`, transitions de statut, **notifications sortantes** vers le client. |
| `src/index.ts` | Cablage : middlewares, commandes, listener generique, `render()`, `setMyCommands`. |

Au demarrage, le bot publie ses commandes (`setMyCommands`) : elles apparaissent dans
le menu **☰** a cote de la zone de saisie. Les admins voient en plus `/admin`.
(Telegram met ce menu en cache : fermer/rouvrir la conversation pour le rafraichir.)

### Cote admin

`ADMIN_IDS` dans `.env` = les `user_id` Telegram autorises (separes par des virgules).
Pour connaitre son id : commande `/id` du bot, ou [@userinfobot](https://t.me/userinfobot).

- `/admin` : recap par etape du pipeline + liste des commandes en cours avec des boutons.
- Les boutons de transition viennent de `features.orderFlow` (par defaut, livraison :
  `pending -> confirmed -> delivering -> delivered`, plus annulation).
- `changeStatus()` (`src/orderFlow.ts`) est le **point de passage unique** : il valide la
  transition (linéaire + annulation), met a jour la base, notifie le client, crédite les
  points de fidélité si le module est actif. Le bot ET la Mini App passent par là.

### Schema base de donnees

`orders` : `id`, `user_id`, `username`, `phone` (nullable), `items` (JSON),
`address` (nullable — retrait), `total`, `status` (id d'étape de `features.orderFlow`),
`route_id`, `route_position`, `delivery_note`, `referral_discount`, `no_show`,
`cancellation_reason`, `created_at` / `updated_at` / `delivered_at`, `alerted`.
Tables de module : `routes`, `route_templates`, `drivers`, `message_templates`,
`loyalty`, `referrals` — créées seulement pour les clients qui activent le module.

## Prerequis

- **Node.js >= 20**
- Un **bot de test** cree via [@BotFather](https://t.me/BotFather) (distinct d'un futur bot de prod)

### Installer Node.js (Windows)

```powershell
winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
```

(Si l'elevation admin bloque : telecharger le zip x64 sur nodejs.org, l'extraire
dans `%LOCALAPPDATA%\Programs\nodejs` et l'ajouter au PATH utilisateur.)

## Installation du projet

```powershell
npm install
Copy-Item .env.example .env
# puis edite .env et colle le token de ton bot de test
```

## Lancer

```powershell
npm run dev            # developpement (reload auto)
npm run build          # compile vers dist/
npm start              # execute la version compilee
npm run typecheck      # tsc back + front

# Tests (in-process sauf smoke ; bases isolees ; voir scripts/README.md)
npm run smoke          # API de bout en bout (bot lance requis)
npm run test:journee   # journee pizzeria simulee (20 clients, 3 tournees)
npm run test:boutique  # client fictif "retrait boutique" (machine a etats, modules off)
npm run test:creneaux  # capacite des creneaux
npm run test:loyalty   # programme de fidelite
npm run test:referral  # parrainage
```

Un autre client se lance avec `CLIENT_ID=boutique-demo npm run dev` (base
distincte via `DB_PATH`).

## Tester (checklist manuelle)

**Navigation + panier**

1. `/start` -> les 2 categories + bouton panier.
2. Cliquer une categorie -> liste des produits (message **edite**, pas empile).
3. Cliquer un produit -> detail + "Ajouter au panier".
4. "Ajouter au panier" -> quantite ; `abc` puis `0` -> refus ; `2` -> ajout + recap.
5. Rajouter le meme produit -> quantites cumulees.

**Checkout**

6. Depuis le panier -> "✅ Valider la commande".
7. Envoyer une adresse (< 5 caracteres -> refus).
8. Taper un numero de telephone (invalide -> refus) -> recapitulatif complet.
9. "✅ Confirmer" -> message "Commande #N enregistree", panier vide.
10. `/mes_commandes` -> la commande apparait avec le statut "en attente de confirmation".
11. `/annuler` pendant le checkout -> abandon, panier conserve.
12. Repasser une commande -> les etapes adresse et telephone proposent un bouton
    "📍 ..." / "📞 ..." pour reutiliser les infos de la derniere commande.

**Mini-admin** (avoir mis son id dans `ADMIN_IDS` et redemarre)

12. Passer une commande -> l'admin recoit "🔔 Nouvelle commande #N" avec des boutons.
13. `/admin` -> tableau de bord + commandes en cours.
14. Cliquer "✅ Confirmer" -> le client recoit "Ta commande #N est confirmee".
15. Enchainer "🛵 En livraison" puis "📦 Livree" -> le client est notifie a chaque etape.
16. `/admin` par un non-admin -> aucune reponse.
