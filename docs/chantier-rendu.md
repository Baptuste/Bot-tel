# Bot Tel — Chantier rendu (Mini App + expérience bot)

Le configurateur (Partie 4 de `feuille-de-route.md`) est mis en pause côté développement —
la documentation reste à jour, mais aucun code n'est lancé dessus tant que ce chantier
n'est pas terminé. Priorité actuelle : le bot démo doit être présentable avant d'aller
plus loin sur les nouveaux modules ou le configurateur.

**Diagnostic** : la logique et l'architecture sont solides (66 checks smoke, chantier
cœur/modules terminé), mais rien n'a encore été retravaillé sur la forme — ni la Mini
App, ni les messages du bot.

---

## Axe 1 — Mini App admin (React) : passe de style

Aujourd'hui fonctionnelle mais sans identité visuelle travaillée. Objectif : que ça
ressemble à un vrai produit, pas à un prototype.

- Définir une direction visuelle cohérente (palette, typographie, espacements) plutôt
  que les styles par défaut — voir le skill `frontend-design` pour la méthode
- Revoir la hiérarchie visuelle des 4 onglets (Commandes, Tournées, Catalogue, Clients) :
  le tableau de bord en tête d'onglet Commandes doit se distinguer clairement de la liste
- Retravailler les cartes de commande, les badges de statut (couleur par statut), les
  boutons d'action
- Vérifier la cohérence sur mobile (la Mini App s'ouvre dans Telegram, donc écran étroit
  prioritaire)
- Ne pas casser l'existant fonctionnel : c'est une passe de style, pas une refonte de
  structure

## Axe 2 — Expérience dans le bot Telegram : trois problèmes identifiés

### 2.1 — Mise en forme des messages
- Audit de tous les messages actuels (`views.ts`, `messageTemplates.ts`, notifications
  `orderFlow.ts`) : trop de texte brut
- Uniformiser l'usage du Markdown Telegram (gras, emojis structurants déjà présents par
  endroits mais pas partout) pour une lecture plus rapide
- Objectif : chaque message doit être scannable en une seconde (statut clair, info clé
  en évidence)

### 2.2 — Longueur du parcours
- Revoir le checkout (actuellement jusqu'à 5 étapes : adresse → téléphone → créneau →
  précision → confirmation) : identifier les étapes qui peuvent être combinées ou
  pré-remplies plus agressivement
- Le pré-remplissage existe déjà (dernière adresse/numéro en un clic) — vérifier qu'il
  est bien mis en avant et pas juste proposé en option discrète
- Regarder si certaines étapes peuvent s'afficher sur un seul message au lieu d'un
  aller-retour par étape, quand c'est pertinent

### 2.3 — Feedback et confirmations
- Après chaque action clé (ajout panier, validation commande, changement de statut),
  s'assurer qu'un retour visuel clair et immédiat est donné — pas seulement un message
  texte qui arrive, mais une confirmation qui rassure
- `answerCbQuery()` est déjà utilisé systématiquement (bonne base) — vérifier que le
  contenu de ces réponses courtes est utile et pas vide
- Étudier l'ajout de petites animations de progression sur les étapes longues (ex.
  tournée en cours) si Telegram le permet nativement

---

## Ce qui ne doit pas bouger

- La logique métier, les flags `features.ts`, la structure de données : ce chantier est
  visuel/UX, pas fonctionnel
- Les tests existants (`smoke`, `test:boutique`, `test:journee`, `test:creneaux`,
  `test:loyalty`, `test:referral`) doivent rester verts — un changement de texte ou de
  style ne doit jamais changer le comportement testé

## Méthode de travail suggérée

1. Commencer par un audit complet (lister tous les messages bot + tous les écrans Mini
   App) avant de coder quoi que ce soit
2. Prioriser ce qui se voit le plus tôt dans le parcours client (`/start`, premier
   message, premier écran Mini App) — c'est ce qui forme la première impression
3. Itérer par petits lots testables plutôt qu'une réécriture massive d'un coup

---

*Chantier prioritaire actuel — le reste de `feuille-de-route.md` (configurateur, modules
restants) reprend une fois ce chantier jugé satisfaisant.*

---

# AUDIT (2026-08-31) — état des lieux avant retouche

## A. Messages du bot Telegram — inventaire

### A.1 Parcours client — `src/views.ts`
| Écran | Texte actuel | Constat |
|---|---|---|
| Accueil catégories | `*Notre menu*\n\nChoisis une categorie :` | correct mais sec ; pas de nom de commerce, pas de « bonjour » |
| `/start` (index.ts) | `Bienvenue ! 👋 Voici notre menu du jour.` puis 2e message catégories | **deux messages** d'affilée pour ouvrir ; le 1er n'apporte rien |
| Liste catégorie | `*<cat>*\n\nChoisis un produit :` | ok |
| Détail produit | `*<label>*\n<description>\n\nPrix : *<n> EUR*` | ok ; si variantes : `Taille :` seul, sans rappel du prix « dès X » |
| Panier vide | `🛒 *Ton panier est vide.*` | ok |
| Panier | `🛒 *Ton panier*\n\n- label x 2  =  22 EUR\n\n*Total : …*` | lisible ; les lignes `-` en texte brut, pas d'alignement |
| Sans accents | tout le fichier | `categorie`, `numero`, `creneau`… — **aucun accent** dans les messages client |

### A.2 Ajout au panier — `src/scenes/quantity.ts`
- `Combien de « <label> » ?\nEnvoie un nombre entre 1 et 99 (ou /annuler).`
- succès : `✅ <n> x <label> ajoute au panier.` puis renvoie le panier complet (2 messages)
- Constat : le « ✅ ajouté » + panier = 2 messages ; pourrait être un seul.

### A.3 Checkout — `src/scenes/checkout.ts`
- En-tête chaque étape : `Etape N/M - <Titre>` (sans accent).
- 5 messages séparés minimum (adresse, tel, créneau, précision, confirmation), chacun
  = un aller-retour. Pré-remplissage : bouton `📍 <adresse>` / `📞 <num>` — présent mais
  **1 bouton seul**, pas mis en avant comme le choix par défaut.
- Récap confirmation : bloc texte dense, ~8 lignes `Cle : valeur`, sans gras, sans accent.
- Fin : `✅ Commande #12 enregistree !` + `Statut : …` + `Tu recevras un message…`.
- Messages d'erreur : `Adresse trop courte…`, `Numero invalide…` — corrects, secs.

### A.4 Notifications sortantes — `src/orderFlow.ts`
- Vers client (arrivalMessage / cancelMessage de `features.ts`) : `✅ Ta commande #12
  est confirmee !\nLivraison estimee : ~45 minutes.` etc. — **avec emoji, sans accent**.
- Vers admin `renderOrderText` : bloc `Commande #12 - statut` + lignes `Cle : valeur`,
  `🔔 Nouvelle commande #12` en tête. Dense, pas de gras, pas d'accents.
- Fidélité : `🎉 <n> points de fidelite ! Tu as debloque : …`.
- Parrainage : `🎁 Ton filleul vient de passer sa premiere commande ! …`.

### A.5 Suivi de tournée — `src/routes.ts`
- `🛵 Ton livreur : <nom>.`
- `🛵 Ta commande #12 : tu es la PROCHAINE livraison ! Tiens-toi pret.`
- `🛵 Ta commande #12 : plus qu'un arret avant toi.` / `encore 2 arrets avant toi.`
- Constat : ton correct, emoji structurant OK ; sans accents ; `#12` = jargon interne
  exposé au client.

### A.6 Admin dans le bot — `src/admin.ts`
- `/admin` → `📊 Tableau de bord\n\n<Étape> : n\n…\n\nN commande(s) a traiter…`
  puis 1 message par commande (`renderOrderText` + clavier).
- `answerCbQuery` sur transition : `Commande #12 : Livree` — utile.

### A.7 Modèles de messages pré-écrits — `src/messageTemplates.ts`
- 4 défauts, avec emoji, **sans accents** (`desole`, `equivalent`, `acces`).

### A.8 Planificateur — `src/scheduler.ts`
- `⏰ N commande(s) en attente depuis +20 min : #3, #5\nA confirmer ou refuser.`

### Constats transverses (bot)
1. **Aucun accent** dans tout le texte utilisateur (choix historique). Pour un rendu
   « produit » en français, c'est le point le plus visible.
2. **Gras Markdown** utilisé au titre seulement, jamais sur l'info clé (statut, total,
   numéro de commande).
3. **`#<id>` interne** montré au client partout.
4. **Multi-messages** là où un seul suffirait (`/start`, ajout panier).
5. Pas de signature / nom du commerce nulle part (`features.displayName` inutilisé côté bot).

---

## B. Mini App admin — inventaire des écrans

| Écran / composant | Rôle | Constat visuel |
|---|---|---|
| `App` / `.tabs` | 4 onglets en ligne | boutons pilule gris, actif = bleu Telegram ; corrects mais plats, pas d'icônes |
| `Orders` | dashboard + filtres + liste | `<h1>` 18px ; dashboard (`.dash`) et liste enchaînés, séparation faible |
| `Dashboard` | 3–4 chiffres du jour + alerte + tournées | `.dash-today` = flex de `strong`/`span`, petit ; alerte urgente orange OK |
| carte commande | `#id` + badge + client + total + créneau | `.card` gris `--tg secondary-bg`, radius 12 ; badge couleur par `data-role` (déjà en place, palette ad hoc) |
| `OrderDetail` | détail + actions statut + message libre | empilement de `.card` ; boutons `.btn` pleine largeur ; bandeaux `.error` réutilisés pour info fidélité (vert) / no-show (orange) — **détournement de `.error`** |
| `OrderEdit` | steppers qty + adresse + créneau | à revoir (non lu en détail) |
| `Catalog` | catégories → produits → variantes | `.card` par catégorie, `.product` en lignes séparées par `border-top` ; boutons `.mini` (Actif/Modifier/Suppr.) serrés |
| `ProductForm` / `ProductVariants` | formulaires | inputs `.form` standard |
| `Routes` | drivers + templates + tournées + affectation | **écran le plus chargé** : Drivers, RouteTemplates, « nouvelle tournée », filtre, puis N cartes tournée avec sous-listes — beaucoup d'infos, peu de hiérarchie |
| `RouteOrderRow` | ligne commande dans une tournée | ▲▼ + actions livrée/souci |
| `Customers` | recherche + liste | `.card` simple, badge no-show rouge |
| `CustomerDetail` | fiche + fiabilité + fidélité + parrainage + historique | `.rel-grid` 4 colonnes ; cartes empilées |
| `MessageTemplates` | chips insérables + gestion | `.template-chips` |

### Constats transverses (Mini App)
1. **Palette = valeurs Telegram par défaut** (`--tg-theme-*`) + **couleurs de statut
   codées en dur** dans `styles.css` (`#e2820a`, `#2f7bd6`, `#7a3fd6`, `#2c9e4b`,
   `#b23b3b`) — pas de système, pas de tokens nommés, pas de gestion claire clair/sombre.
2. **`.error` détourné** pour afficher des infos positives (fidélité en vert) et des
   avertissements — un seul composant « bandeau » à créer, décliné par intention.
3. **Typo** : un seul `<h1>` 18px, pas d'échelle (h2/h3), `font-size` 15/13/12 au jugé.
4. **Hiérarchie** : dashboard vs liste dans `Orders`, et les 4 blocs de `Routes`, ne
   se distinguent pas assez (tout est `.card` gris identique).
5. **Onglets** : `.tabs button` à `flex:1` + `text-overflow:ellipsis` — « Catalogue »
   peut être tronqué sur petit écran ; pas d'icône pour compenser.
6. **Espacements** : `margin-bottom: 10/12px` un peu partout, pas de rythme vertical.
7. Points positifs à garder : cartes cliquables, `BackButton` Telegram câblé, badges
   déjà pilotés par `data-role`, responsive de base (`max-width: 640px`, flex-wrap).

---

## C. Ordre de bataille (petits lots testables) — **terminé**

> Règle tenue à chaque lot : `npm run typecheck` 0 + smoke 66 + boutique 29 +
> journee 30 + creneaux 7 + loyalty 13 + referral 16, tous verts. Bot redémarré
> et boot vérifié après chaque lot bot.

Direction visuelle (skill `frontend-design`) : **le bon de commande**. Métaphore
d'un outil de comptoir — tickets de caisse, tampons encreurs, bordereaux.
Signature : n° en chiffres mono, statut « tamponné » (encadré, incliné -1,5°),
bord haut + total sous ligne pointillée, tableau de bord en bandeau de caisse.
Typo : pile système pour la prose, **IBM Plex Mono** pour toute la donnée.

| Lot | Contenu | Commit |
|---|---|---|
| **1** | Design system Mini App : tokens CSS (couleur/typo/espace/rayon) sur `--tg-theme-*`, clair+sombre, `.notice` (remplace `.error` détourné), IBM Plex Mono. Zéro JSX. | `0db98a1` |
| **2** | Onglet Commandes : bandeau « Aujourd'hui », carte docket 4 niveaux, points de conduite sur les articles, `.flag` pour les alertes client. | `a15ccc2` |
| **3** | Accueil bot : `/start` = greeting court + menu, `features.displayName` en tête, `/help` adaptatif (modules), ajout panier en 1 message, accents `views.ts`. | `491f8cf` |
| **4** | Checkout : fast-path « ⚡ Mêmes adresse et numéro » (address+phone en 1 tap, saute l'étape téléphone), récap à icônes (📍📞🕒📝💳) sans `parse_mode`, accents. | `421bd17` |
| **5** | Notifications : `features.ts` flows (label/arrival/cancel), `renderOrderText` à icônes, `routes.ts` (progression sans genrer le client), `scheduler.ts`, `messageTemplates.ts`, `/fidelite` + `/parrainage`. Assertions de test synchronisées. | `6583ad0` |
| **6** | Écrans Mini App restants : accents sur toute la copie admin, en-têtes `<h2>` (intercalaires mono), `.product` flex-wrap (fix wrapping « dès 9 € »), `.badge.cancelled` → `.flag`, séparateurs `·`. | `5e73196` |
| **7** | Feedback : `answerCbQuery` utiles (« Créneau choisi », « Commande envoyée ! »). Passage global **EUR → €** (bot + Mini App). | `76257a7` |
| **8** | *Styliser davantage.* Mini App : **bandeau d'en-tête** (nom boutique, était absent), **barre de progression** des tournées (dashboard + carte), états vides calmes, effet d'appui. Bot : **panier + récap checkout en bloc monospace `\`\`\``** (colonnes alignées, points de conduite, TOTAL) — écho direct du docket. Le récap met tout dans le bloc → `parse_mode` réactivé sans risque de casse. | `a1b2783` |
| **9** | *Identité visuelle du bot client* (jugé trop « menu basique »). Passage **parse_mode HTML** ; descriptions produits en `<blockquote>` ; boutons en **grille 2 colonnes** ; en-têtes d'étape checkout stylés ; commandes client en HTML. Helper `esc()` sur toute valeur dynamique. | `8c85e80` |
| **10** | Le cartouche `<pre>` ASCII du Lot 9 était moche → **vraie bannière image** (`assets/menu-banner.png`) sur `/start`, nom de la boutique en caption. `section()` = `<b>` seul. | `e271925` |
| — | Blockquotes (fond bleuté) jugées non conformes → italique + gras. | `d71d09a` |
| **11** | *Le texte ne suffit pas.* Essai de **cartes-images générées** (`@resvg/resvg-js`, SVG composé à la main, IBM Plex Mono embarqué). `src/render/cards.ts`. | `c4ea3ff` |
| — | **Retour utilisateur : cartes-menu « trop amateur ».** Menu + récap checkout → **retour au texte**. On garde seulement `orderTicketPng` (reçu de confirmation). `menuPagePng` supprimé. | `805d5fe` |

**État du bot client** : `/start` = bannière image (à retravailler) · menu / produit /
panier / récap = **texte HTML** (gras, italique, `<pre>` pour les tickets) · confirmation
de commande = **reçu-image** (`orderTicketPng`).

**Reste** : retravailler l'accueil ; choix explicite du mode de paiement + pourboire
au checkout (reliquat V2).

Une fois ce chantier jugé satisfaisant : reprise de `feuille-de-route.md`
(Partie 4 configurateur, module marketing).
