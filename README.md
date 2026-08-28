# Bot Tel

Bot Telegram d'une petite boutique de livraison + Mini App admin.

**Documentation** :
- [`docs/cadrage.md`](docs/cadrage.md) — cadrage initial (le pourquoi, roadmap V1/V2)
- [`docs/avancement.md`](docs/avancement.md) — état réel du projet, historique des briques
- [`docs/coeur-et-modules.md`](docs/coeur-et-modules.md) — direction : cœur générique + modules par client

Ce README couvre l'architecture et l'installation.

## Parcours client

- `/start` -> navigation **categories -> produits -> detail** en inline keyboards
  (un seul message qui se met a jour via `editMessageText` ; un produit avec photo
  s'affiche en message image et remplace le message precedent) ;
- ajout au panier **avec quantite** (scene telegraf) ;
- **recapitulatif** du panier + **modification ligne par ligne** (- / + / supprimer) ;
- **checkout** (5 etapes) : adresse -> telephone -> **creneau** -> **precision de
  livraison** (etage/code, optionnelle) -> confirmation. Commande **persistee** (SQLite),
  deja rattachee a sa tournee, panier vide. Adresse / numero / precision de la
  derniere commande proposes en un clic. A la validation, les produits devenus
  indisponibles / re-tarifes sont signales avant de confirmer ;
- `/mes_commandes` : historique client (lecture simple) ;
- **mini-admin dans le bot** : `/admin` (tableau de bord + boutons de transition de
  statut). Chaque changement de statut **notifie le client** (le bot devient bidirectionnel) ;
- **Mini App admin** (React, `web/`) servie par le serveur HTTP du bot. Auth =
  validation de l'`initData` Telegram (HMAC) + verification `ADMIN_IDS`. Quatre onglets :
  - *Commandes* : **tableau de bord** (CA du jour, alertes commandes en attente, tournees
    en cours) + liste, filtres, detail, changement de statut, **modification de la commande**
    (articles / adresse / creneau), tel cliquable, message libre (+ modeles) ;
  - *Tournees* : **modeles de creneaux recurrents** (15:00 / 18:00 / 21:00 par defaut,
    materialises chaque jour par `src/scheduler.ts`), tournees ponctuelles, affectation
    des commandes, **ordre de livraison reordonnable**, demarrer / terminer. Pendant la
    tournee : par commande, **Livree** (notifie les 3 clients suivants de leur position)
    ou **Souci** (annulation + raison) ;
  - *Catalogue* : categories + produits + **tailles/variantes** (prix par taille)
    + **photo** (redimensionnee cote client, servie en `/uploads/`), activer/desactiver,
    ajouter/modifier/supprimer (le bot voit les changements immediatement : meme
    process -> cache invalide) ;
  - *Clients* : liste + recherche, fiche (nom, note de livraison, notes admin, historique),
    **taux de fiabilite calcule** (livrees vs no-show), blocage (liste noire). Annulation
    d'une commande = raison + case "imputer au client".

**État** : V1 complet, V2 ~90 % (voir `docs/avancement.md`). Reste : mode de paiement /
pourboire au checkout, multi-livreurs ; transverse : hébergement 24/7 (au lieu du
tunnel), RGPD, gestion de stock.

## Lancer la Mini App admin (dev)

```powershell
npm run web:install     # 1re fois : dependances de web/
npm run build:web       # build de la Mini App -> web/dist (servie par le serveur Node)
npm run dev             # bot + serveur HTTP (port 3000)
npm run tunnel          # dans un 2e terminal : tunnel HTTPS cloudflared -> localhost:3000
```

Le tunnel affiche une URL `https://xxx.trycloudflare.com`. La copier dans `.env` :
`WEBAPP_URL=https://xxx.trycloudflare.com`, puis **relancer `npm run dev`**
(le bot y branche le bouton "menu" de la Mini App et le bouton dans `/admin`).

> L'URL du tunnel gratuit change a chaque redemarrage de cloudflared : il faut
> re-renseigner `WEBAPP_URL` et relancer le bot. En prod, on hebergera le serveur
> avec un vrai domaine.

## Architecture (le "pourquoi")

Donnees et logique sont **strictement separees**. Chaque brique = une table qui
se greffe sans reecrire l'existant.

| Fichier | Role |
|---|---|
| `menu.json` (racine) | **Contenu initial** du catalogue : seme la base au 1er demarrage, plus utilise ensuite. |
| `data/bot.db` | Base SQLite locale (ignoree par git). Cree automatiquement au 1er lancement. |
| `src/catalog.ts` | Catalogue en base : `getMenu()` (menu filtre pour le bot) + CRUD (Mini App). |
| `src/uploads.ts` | Images produits sur disque (`data/uploads/`), decode base64 / suppression. |
| `src/db.ts` | Connexion SQLite + 9 tables (`orders`, `categories`, `products`, `product_variants`, `routes`, `route_templates`, `sessions`, `customers`, `message_templates`). |
| `src/orders.ts` | Requetes sur `orders`. Une commande = donnee **definitive**. |
| `src/customers.ts` | Fiche client consolidee + taux de fiabilite (calcule depuis `orders`). |
| `src/orderFlow.ts` | Cycle de vie d'une commande : `changeStatus()`, transitions, notifications client (hors UI). |
| `src/routes.ts` | Tournees + modeles de creneaux + suivi en direct (`markDelivered`, `notifyRouteProgress`). |
| `src/scheduler.ts` | Planificateur : tournees + purge sessions (horaire) + alerte commandes en attente (5 min). |
| `src/dashboard.ts` | Agregats du tableau de bord admin + detection des commandes en attente trop longtemps. |
| `src/messageTemplates.ts` | Modeles de messages pre-ecrits (CRUD, seed de 4 par defaut). |
| `src/sessionStore.ts` | Store de sessions telegraf sur SQLite (persistance + TTL + purge). |
| `src/api/` | Routes Express de la Mini App (`orders`, `catalog`, `routes`) + `auth` (initData). |
| `src/cart.ts` | Panier **en memoire** (perdu au redemarrage). Devient une ligne `orders` a la validation. |
| `src/views.ts` | Transforme (menu, panier) en `{ text, keyboard }`. N'envoie rien. |
| `src/callbacks.ts` | `callback_data` structurees (`nav:cat:pizzas`...) + parsing. Un seul listener generique. |
| `src/scenes/quantity.ts` | Scene simple (BaseScene) : attend une quantite. |
| `src/scenes/checkout.ts` | WizardScene 5 etapes : adresse -> tel -> creneau -> precision -> confirmation (+ reconcile panier). |
| `src/admin.ts` | Mini-admin : `/admin`, transitions de statut, **notifications sortantes** vers le client. |
| `src/index.ts` | Cablage : middlewares, commandes, listener generique, `render()`, `setMyCommands`. |

Au demarrage, le bot publie ses commandes (`setMyCommands`) : elles apparaissent dans
le menu **☰** a cote de la zone de saisie. Les admins voient en plus `/admin`.
(Telegram met ce menu en cache : fermer/rouvrir la conversation pour le rafraichir.)

### Cote admin

`ADMIN_IDS` dans `.env` = les `user_id` Telegram autorises (separes par des virgules).
Pour connaitre son id : commande `/id` du bot, ou [@userinfobot](https://t.me/userinfobot).

- `/admin` : compte les commandes par statut + liste les commandes en cours avec des boutons.
- Boutons : `pending -> confirmed -> delivering -> delivered`, plus annulation.
- `changeStatus()` (`src/admin.ts`) est le **point de passage unique** : il valide la
  transition, met a jour la base, envoie la notification au client. La future Mini App
  admin appellera la meme fonction.

### Schema base de donnees (V1)

`orders` : `id`, `user_id`, `username`, `phone`, `items` (JSON), `address`,
`total`, `status` (`pending` par defaut), `route_id` (rempli plus tard), `created_at`.

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
npm run dev      # developpement (reload auto)
npm run build    # compile vers dist/
npm start        # execute la version compilee
npm run typecheck
npm run smoke    # test de fumee de l'API (bot lance requis) - voir scripts/README.md
```

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
