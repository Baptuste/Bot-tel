# Bot Telegram Boutique / Livraison — Document de cadrage

> Reprise du prompt de démarrage initial. Sert de mémoire du raisonnement et de la
> direction du projet : à consulter pour comprendre le **pourquoi** des choix, pas
> comme une liste de tâches.

## Contexte général

Projet né d'une envie d'explorer les bots Telegram (menus, boutique en ligne, gestion
de commandes et de livraison), sans idée figée au départ. Le concept retenu : une
**petite boutique de livraison** (type restaurant / pizzeria) gérée via Telegram, avec
en toile de fond l'idée qu'un **outil de création / gestion de menu** doit émerger
naturellement de l'architecture — pas comme un projet à part, mais comme conséquence
logique d'une bonne séparation données / logique dès le départ.

Approche voulue : **progressive et pédagogique**. On construit brique par brique, on
valide chaque étape avant de complexifier. Projet découverte, pas cahier des charges
figé : comprendre les mécanismes autant que faire avancer le produit.

## Stack technique retenue

- **Langage** : Node.js + TypeScript
- **Librairie bot** : telegraf (commandes, inline keyboards, scenes pour les flux conversationnels)
- **Base de données** : SQLite pour débuter (retenu), Supabase envisagé si besoin de temps réel
- **Mini App(s)** : React, comme les autres projets
- **Secrets** : fichier `.env`, jamais commité, jamais codé en dur

## Raisonnement architectural fondamental

Principe directeur, à respecter dès la V1 : **séparer strictement les données de la logique**.

- Le contenu du menu (catégories, produits, prix) ne doit jamais être codé en dur dans
  la logique du bot.
- D'abord un fichier `menu.json` externe ; à terme, une base de données lue en temps réel.
- C'est cette séparation qui rend possible, plus tard, un vrai outil de création / édition
  de menu (formulaire web ou Mini App admin) **sans jamais retoucher le bot client** :
  l'outil écrit dans la base, le bot la lit, aucun des deux ne "connaît" l'autre.
- Même principe pour les commandes, tournées, clients : chaque nouvelle brique = une
  nouvelle table qui se greffe, sans réécrire l'existant.

## Le bot est bidirectionnel

Le bot ne réagit pas seulement aux messages du client (entrant) : il doit pouvoir
**envoyer des messages de sa propre initiative** (sortant), déclenchés par des événements
côté admin (changement de statut, démarrage de tournée, rupture de stock). Le `user_id`
de chaque client est conservé en base pour pouvoir lui écrire à tout moment.

## Répartition bot vs Mini App (vision cible)

Les deux cohabitent, sur la même base et la même logique métier.

- **Le bot (messages classiques)** : canal de notification asynchrone — arrivages,
  promotions, ruptures, confirmations, mises à jour de tournée. L'info arrive sans que
  l'utilisateur ait rien à ouvrir.
- **La Mini App** : interface riche — catalogue avec photos, panier confortable,
  historique ; côté admin, gestion graphique des commandes / tournées / catalogue.
- Potentiellement deux Mini Apps (client / admin), ou une seule qui détecte l'identité.

## Flux métier complet imaginé

1. Le client navigue le menu, ajoute des produits au panier avec quantité.
2. Il valide, fournit adresse et téléphone.
3. La commande est enregistrée avec un statut initial ("en attente" / "à confirmer").
4. L'admin voit la commande arriver, l'assigne à une tournée (adresse, horaire).
5. Le client reçoit une confirmation avec heure estimée.
6. Au fil de la tournée, le client reçoit des mises à jour (démarrée, retard, en cours).
7. Une fois livrée, la commande passe "livrée" et reste consultable (requête filtrée sur
   le statut, pas de table séparée).

## Gestion de l'état de conversation (scenes)

Pour toute réponse en texte libre du client (quantité, adresse), utiliser le système de
**scenes** de telegraf. Chaque scene sait ce qu'elle attend et se quitte proprement.

Bien distinguer **session** (état temporaire) et **commande** (donnée définitive). Les
sessions doivent être nettoyées via trois mécanismes complémentaires :
- suppression immédiate à la sortie de scene ;
- vérification de péremption (TTL) à la lecture ;
- purge périodique (tâche planifiée) des sessions abandonnées.

## callback_data et structure de code

Éviter un `bot.action` par bouton. Utiliser des `callback_data` structurées
(`menu:category:pizzas`, `menu:product:pizzas:margherita`, `menu:back:categories`) et un
seul listener générique par regex qui parse et redirige.

## Prévention de la fraude (paiement à la livraison)

Paiement à la livraison (espèces / carte sur place), pas de paiement Telegram. Risque de
fausses commandes à anticiper dans le schéma de données (pas forcément codé en V1) :

- Numéro de téléphone demandé et conservé dès la première commande (`request_contact`,
  difficile à falsifier).
- Taux de fiabilité calculé depuis l'historique (honorées vs no-show), pour filtrer
  silencieusement les clients à risque.
- Statut intermédiaire "à confirmer" avant assignation à une tournée = contrôle humain.
- Pour les nouveaux clients ou grosses commandes : confirmation par appel téléphonique.

## Informations à collecter

**Client (schéma)** : téléphone, nom complet, note / instruction de livraison libre
(étage, code), historique de fiabilité calculé.

**Admin (schéma)** : capacité max par tournée, livreur assigné, raison d'annulation en
texte libre (distinguer abus et souci légitime sans fausser les stats).

**Explicitement non pertinent** : email, infos bancaires / facturation, géolocalisation
GPS temps réel, date de naissance / démographie.

## Contact admin ↔ client

Depuis la fiche d'une commande : appel téléphonique direct (lien `tel:`) et envoi d'un
message pré-rempli via le bot. Pas de système de chat à réinventer — Telegram le fait.

## Besoins côté admin (vision d'ensemble)

- Tableau de bord (commandes du jour par statut, CA, alertes, avancement des tournées)
- Gestion des commandes (liste / filtrage, détail, modification avant validation,
  changement de statut, raison d'annulation, historique)
- Gestion des tournées (création / édition, affectation manuelle ou semi-auto,
  réaffectation, avancement, démarrage / fin déclenchant les notifications)
- Gestion du catalogue — **l'outil de création / édition de menu** (catégories, produits,
  activation / désactivation, prix, photos / descriptions, promotions futures)
- Gestion clients (fiche, historique, fiabilité, liste noire, notes, recherche)
- Communication client (templates, appel direct, historique des échanges)
- Gestion des livreurs (liste, attribution, disponibilité)
- Statistiques / reporting (best-sellers, créneaux chargés, taux d'annulation, zones)
- Paramètres généraux (horaires, tournées, seuils d'alerte, templates)

## Améliorations à garder en tête (sans urgence)

- "Commander comme la dernière fois" (une fois l'historique constitué)
- Estimation d'attente dynamique basée sur la charge réelle de la tournée
- Parrainage / codes promo entre clients
- FAQ automatique par boutons / mots-clés
- Anticipation de stock (alerte seuil bas, pas seulement rupture) — priorité un peu plus haute
- Optimisation d'itinéraire via API de trajet
- Export comptable simple (CSV / PDF)
- Mode "fermeture rapide" des commandes
- Journal d'activité admin (audit)
- Gestion des pourboires (champ optionnel)

## Priorisation V1 / V2 / plus tard

### 🟢 V1 — Bot client
- `/start` → catégories → produits → détail via inline keyboards, `editMessageText`,
  `answerCbQuery()` systématique
- Ajout au panier avec quantité (scene simple)
- Récapitulatif du panier avant validation
- Adresse (texte libre) + téléphone (`request_contact`)
- Validation finale
- Message de confirmation + notifications de suivi

### 🟢 V1 — Base de données
- `products` (id, category, name, description, price, available)
- `orders` (id, user_id, username, phone, items JSON, address, status, route_id, created_at)
- `routes` (id, date, time_slot, status)
- `sessions` (user_id, step, temp_data, created_at) — avec les trois mécanismes de nettoyage

### 🟢 V1 — Mini App admin
- Liste des commandes + détail
- Changement de statut manuel
- Création de tournées (créneaux simples) + affectation manuelle
- Gestion basique du catalogue
- Contact direct (téléphone cliquable, message libre via le bot)

### 🟡 V2 — Bot client
- `/mes_commandes`, modification du panier, choix explicite du mode de paiement, note de
  livraison optionnelle, message d'erreur si produit devenu indisponible

### 🟡 V2 — Mini App admin
- Modification d'une commande avant validation, raison d'annulation, alertes commande en
  attente, capacité max par tournée + avancement temps réel, fiche client + fiabilité,
  notes libres, templates de messages, tableau de bord basique

### 🟡 V2 — Base de données
- `customers` (user_id, name, phone, total_orders, no_show_count, notes)
- Ajouts `orders` (cancellation_reason, updated_at, delivered_at)
- Ajouts `routes` (driver_name, max_capacity)
- `message_templates` (id, label, content)

### 🔴 Plus tard
- Mini App client avec catalogue visuel riche
- Recherche produit (inline mode Telegram)
- Recommandation de commande passée, fidélité, parrainage
- Anticipation de stock à seuil bas
- Optimisation d'itinéraire
- Multi-livreurs avec disponibilité
- Stats avancées, promotions / prix temporaires
- Export comptable, mode fermeture rapide, journal d'activité admin, pourboires
- Tables : `drivers`, `order_history`, `promotions`, `zones`

## Points d'attention transverses

- **RGPD** : prévoir un mécanisme de suppression des données personnelles sur demande.
- **Sécurité des secrets** : toujours via `.env`, jamais commité (`.gitignore` dès l'init).
- **Validation Mini App admin** : valider les `initData` signés (HMAC avec le token du bot).
- **Hébergement** : le bot doit tourner 24/7 — prévoir Railway / Render / Fly.io.
- **Gestion des erreurs** : `try/catch` sur les appels API Telegram et base, logs clairs.
- **Bot de test séparé** : bot distinct (BotFather) pour tout le dev.

## Fichier `menu.json` de test

```json
{
  "pizzas": {
    "label": "🍕 Pizzas",
    "items": {
      "margherita": { "label": "Margherita", "price": 9, "description": "Tomate, mozzarella, basilic" },
      "reine":      { "label": "Reine", "price": 11, "description": "Jambon, champignons, mozzarella" }
    }
  },
  "burgers": {
    "label": "🍔 Burgers",
    "items": {
      "classic": { "label": "Classic", "price": 8, "description": "Steak, cheddar, salade, tomate" }
    }
  }
}
```

## Objectif de la première session (rappel historique)

Se concentrer sur la brique **V1 — Bot client**, architecture données / logique séparées
dès le départ (`menu.json` externe) :

1. Init Node + TS + telegraf, `.env`, `.gitignore`
2. Chargement du menu depuis `menu.json`
3. Navigation inline keyboards avec `editMessageText` / `answerCbQuery()` et listener générique
4. Ajout au panier avec quantité (scene), panier en mémoire
5. Récapitulatif du panier

Ne PAS faire à ce stade : base persistante, Mini App, tournées, paiement Telegram,
gestion clients / fiabilité.

---

Pour l'état réel du projet (bien au-delà de cette première session), voir
[`avancement.md`](./avancement.md).
