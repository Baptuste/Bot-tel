# Vers un cœur commun + modules — document de conception

> Sert de mémoire du raisonnement pour la transformation du bot mono-client
> (pizzeria/livraison) en un cœur générique réutilisable pour d'autres métiers
> (vêtements, autres commerces...), chacun avec ses propres modules activés.
> Comme pour `cadrage.md`, ce document explique le **pourquoi** des choix — pas
> une simple liste de tâches. À lire après [`cadrage.md`](./cadrage.md) et
> [`avancement.md`](./avancement.md).

## Contexte et origine de cette réflexion

Le projet est né comme une découverte technique sans ambition commerciale
figée. Mais dès les premières discussions de cadrage, une idée de fond a
émergé et n'a jamais quitté la table : gérer un jour plusieurs clients aux
métiers différents (vêtements, burgers, pizzas...) sans dupliquer le code à
chaque fois — un **cœur commun** avec des **modules optionnels activables**
selon le besoin métier de chacun. Cette idée s'inscrit elle-même dans une
vision plus large encore : un futur second bot "configurateur", qui
permettrait à un client de choisir ses options, de générer un cahier des
charges et un devis, puis de recevoir un déploiement adapté — une manière
d'industrialiser la vente de bots similaires à d'autres commerces.

Le bot actuel (pizzeria/livraison) a été construit en respectant déjà un
principe proche : séparer strictement les données de la logique, faire de
chaque nouvelle brique une table qui se greffe sans réécrire l'existant. Mais
ce principe a été appliqué **à l'intérieur d'un seul métier**. Rien dans le
code d'aujourd'hui ne permet de faire tourner ce bot pour un autre type de
commerce sans le réécrire en profondeur.

**Pourquoi s'y mettre maintenant plutôt que plus tard ?** Le code est encore
petit (~200 Ko de `src/`, 16 briques). C'est le moment où une refonte de
structure coûte le moins cher : plus on ajoute de briques métier
"livraison-only" sans base modulaire, plus chaque fonctionnalité future
(paiement, multi-livreurs...) viendra encore renforcer le couplage à ce
métier précis, et plus la migration future sera coûteuse et risquée. Faire ce
travail maintenant, c'est aussi l'occasion de valider — avant de chercher un
vrai second client — que l'hypothèse "cœur + modules" tient réellement la
route, avec un cas d'usage fictif simple (voir la dernière étape plus bas).

## Constat de départ (état du code au 28/08/2026)

Le code actuel est propre — séparation données/logique respectée, `changeStatus()`
et `orderFlow.ts` comme points de passage uniques, cache catalogue invalidé à
l'écriture — mais **entièrement mono-métier livraison**. Concrètement, quatre
endroits portent cette hypothèse implicite :

- `config.ts` ne contient que des variables techniques (token, port, admin
  ids, URL). Il n'existe aujourd'hui **aucune notion de client** — aucune
  ligne de code ne dit "ce déploiement a des tournées" ou "ce déploiement
  fait du retrait en boutique". Toute variation de comportement est donc, par
  construction, du code métier livraison écrit en dur.
- Le schéma DB crée `routes` / `route_templates` / `orders.route_id` /
  `orders.route_position` **inconditionnellement** au démarrage (`db.ts`) — ce
  ne sont pas des tables optionnelles greffées à la demande comme le
  principe du projet le prévoyait à l'origine pour les commandes ou les
  clients ; elles font partie du socle, que le module tournées serve ou non.
- `orders.address` et `orders.phone` sont `NOT NULL` en base et typés
  `string` (jamais `string | undefined`) dans tout `orders.ts`. Cela
  suppose, au niveau du schéma lui-même, qu'il existe toujours une adresse de
  livraison — donc qu'un mode "retrait en boutique" est structurellement
  impossible sans migration.
- `scenes/checkout.ts` est une `WizardScene` à **5 étapes câblées en dur**
  (adresse → téléphone → créneau → précision → confirmation), qui importe
  directement `getAvailableSlots()` de `routes.ts`. Le parcours client
  lui-même est donc écrit pour un seul métier, pas paramétré.

Ce n'est pas un problème de qualité de code — c'est attendu et normal pour un
premier client construit brique par brique sans besoin de généraliser avant
d'avoir un deuxième cas réel à comparer. Le but de ce document est justement
de transformer cette première implémentation en référence pour le cœur
commun, sans perdre ce qui a déjà bien fonctionné.

**Point positif à conserver tel quel** : `product_variants` (table + code) a
été conçue de façon **déjà générique** — `label` + `price`, sans colonne
`size` figée. Cette table sert sans aucune modification à des tailles, des
couleurs, des poids ou toute autre déclinaison de produit. C'est la preuve
que la discipline de séparation données/logique, quand elle est appliquée
jusqu'au bout, produit naturellement du code réutilisable — exactement ce
qu'on veut généraliser au reste du projet.

## Modèle multi-tenant retenu, et pourquoi

Deux options ont été mises en balance :

- **(a) Un process / un bot par client**, base SQLite séparée, code partagé
  via un socle commun (ce repo) — chaque client a son propre déploiement,
  sa propre base, son propre `.env`.
- **(b) Une seule base multi-tenant**, avec une colonne `client_id` sur
  quasiment toutes les tables, un seul process qui sert tout le monde.

L'option (a) a été retenue. Raisonnement : (b) impose dès le départ une
discipline de sécurité beaucoup plus stricte (filtrer *chaque* requête par
`client_id`, sous peine de fuite de données entre clients — un bug de ce
type est silencieux et grave) et une complexité opérationnelle plus lourde
(migrations qui doivent tourner sur une base commune à tous en même temps,
un incident affecte potentiellement tout le monde). Pour le volume de
clients envisagé au démarrage (quelques déploiements, pas des centaines),
(a) est nettement plus rapide à mettre en œuvre, plus simple à raisonner, et
isole totalement les incidents d'un client par rapport aux autres. Le coût
en échange : autant de déploiements à maintenir que de clients — un coût
jugé acceptable tant que le nombre reste petit.

Ce choix n'est pas gravé dans le marbre : si le volume de clients grandissait
au point de rendre la gestion de N déploiements pénible, une migration vers
(b) resterait possible plus tard. Mais elle ne bloque pas le travail décrit
ici : que le tenant soit isolé par process ou par `client_id`, le vrai
chantier — séparer ce qui est générique de ce qui est spécifique à un métier
— est identique dans les deux cas. Faire ce travail maintenant n'est donc pas
un pari perdu si le modèle (a) devait être remis en question plus tard.

Chaque client aura donc son propre `.env`, sa propre base `data/bot.db`, et
un fichier de configuration de features (voir ci-dessous) qui vit dans son
déploiement — c'est ce fichier, et lui seul, qui devra changer pour adapter
le bot à un nouveau métier.

## Schéma de configuration client (`src/features.ts`)

L'idée centrale de toute cette refonte : un **objet de configuration
unique**, chargé au démarrage, qui pilote quels modules sont actifs et
comment ils s'affichent. C'est la pièce qui remplace le raisonnement
implicite ("ce bot est fait pour la livraison") par un raisonnement explicite
et déclaratif ("ce client a activé tel et tel module"). Tout le reste de la
refonte — checkout conditionnel, tables optionnelles, Mini App adaptative —
consiste simplement à faire lire cette configuration là où le code fait
aujourd'hui des hypothèses figées.

Première proposition de structure :

```ts
export interface ClientFeatures {
  clientId: string;
  displayName: string;

  /** Mode(s) de remise de la commande. */
  fulfillment: 'delivery' | 'pickup' | 'both';

  /** Étape adresse obligatoire dans le checkout. */
  requiresAddress: boolean;
  /** Étape téléphone obligatoire dans le checkout. */
  requiresPhone: boolean;

  /** Module tournées (routes.ts, route_templates, l'onglet "Tournées" de la Mini App). */
  deliverySlots: { enabled: boolean };

  /** Étape "précision de livraison" (étage, code...). */
  deliveryNote: { enabled: boolean; label: string };

  /** Variantes de produit — déjà générique en base, seul le libellé change. */
  variants: { enabled: boolean; label: string }; // "Taille", "Couleur", "Poids"...

  /** Modes de paiement acceptés + pourboire (V2 en cours). */
  payment: { methods: Array<'cash' | 'card'>; tipEnabled: boolean };

  /** Fiabilité / no-show — pertinent surtout en livraison à domicile. */
  reliability: { enabled: boolean };
}
```

Chaque champ correspond à une hypothèse aujourd'hui figée dans le code
(recensées dans le constat plus haut) transformée en paramètre. Rien de plus
n'est ajouté pour l'instant : l'objectif de cette première version est de
couvrir exactement les points de couplage identifiés, pas d'anticiper des
besoins hypothétiques non observés.

Exemple pour le client actuel (pizzeria/livraison) — cette configuration doit
reproduire **exactement** le comportement du bot tel qu'il fonctionne
aujourd'hui, aucun changement visible pour ce client :

```ts
export const features: ClientFeatures = {
  clientId: 'pizzeria-test',
  displayName: 'Pizzeria Test',
  fulfillment: 'delivery',
  requiresAddress: true,
  requiresPhone: true,
  deliverySlots: { enabled: true },
  deliveryNote: { enabled: true, label: "Étage, code d'accès, bâtiment..." },
  variants: { enabled: true, label: 'Taille' },
  payment: { methods: ['cash', 'card'], tipEnabled: false },
  reliability: { enabled: true },
};
```

Exemple pour un futur client fictif "vêtements, retrait en boutique" — ce
scénario sert justement de test de l'hypothèse "cœur + modules" (voir
dernière étape) : si l'architecture est bien pensée, **seul ce fichier
change**, aucune ligne du cœur (`catalog.ts`, `orderFlow.ts`, `cart.ts`...)
n'a besoin d'être touchée pour ce nouveau métier :

```ts
export const features: ClientFeatures = {
  clientId: 'boutique-vetements',
  displayName: 'Boutique Test',
  fulfillment: 'pickup',
  requiresAddress: false,
  requiresPhone: true,
  deliverySlots: { enabled: false },
  deliveryNote: { enabled: false, label: '' },
  variants: { enabled: true, label: 'Taille / Couleur' },
  payment: { methods: ['cash', 'card'], tipEnabled: false },
  reliability: { enabled: false },
};
```

## Impact par zone du code

### 1. Checkout (`scenes/checkout.ts`)

C'est la zone la plus visible pour le client, et celle qui porte le plus
d'hypothèses métier aujourd'hui. Bonne nouvelle en l'analysant : le code
chaîne déjà ses étapes de façon **impérative** (`askAddress` appelle
`promptPhone` qui appelle `promptSlot`...) plutôt que de dépendre d'un index
de wizard strict décidé à l'avance. Ce style de code, choisi à l'origine pour
la lisibilité, se prête très bien à la conditionnalité : **sauter une étape
désactivée revient simplement à appeler directement la fonction de l'étape
suivante**, sans toucher à la mécanique interne de `WizardScene` de telegraf
ni réécrire le wizard depuis zéro. C'est le genre de bonne surprise qui
justifie de vérifier le code réel avant de supposer qu'un refactor sera
lourd. Exemple pour l'étape adresse :

```ts
async function askAddress(ctx: BotContext): Promise<void> {
  if (!features.requiresAddress) {
    state(ctx).address = undefined;
    await promptPhone(ctx); // on saute directement à l'étape suivante
    ctx.wizard.next();
    return;
  }
  // ... comportement actuel inchangé
}
```

Même principe pour `promptSlot` (si `deliverySlots.enabled === false`, on
saute à `promptNote`) et `promptNote` (si `deliveryNote.enabled === false`,
on saute à `promptConfirm`). Le numéro d'étape affiché au client ("Étape
1/5") devient calculé dynamiquement à partir du nombre d'étapes réellement
actives pour cette configuration, pour ne jamais afficher "3/5" à un client
dont le parcours ne compte réellement que 3 étapes.

### 2. Base de données (`db.ts`, `orders.ts`)

- `orders.address` et `orders.phone` passent en `TEXT` nullable (retrait du
  `NOT NULL` dans le schéma) ; `NewOrder.address` / `.phone` deviennent
  `string | undefined` dans les types TypeScript correspondants. C'est une
  migration additive au sens du principe déjà en place dans `db.ts`
  (`ensureColumn`) — pas une réécriture destructive.
- Les tables `routes` / `route_templates` ne sont créées que si
  `features.deliverySlots.enabled` : le `db.exec(...)` du bloc tournées est
  sorti dans une fonction dédiée (`createDeliveryTables()` par exemple),
  appelée conditionnellement au démarrage. Pour un client sans livraison, ces
  tables n'existent tout simplement pas dans sa base.
- `customers` (fiabilité/no-show) reste créée dans tous les cas — le coût de
  la table est nul si elle n'est pas utilisée — mais l'onglet Mini App
  correspondant et les calculs de taux de fiabilité ne s'affichent / ne
  s'exécutent que si `reliability.enabled`.

### 3. API / Mini App (`src/api/routes.ts`, `web/`)

- Les routes Express de `/api/routes` ne sont montées sur le serveur que si
  `deliverySlots.enabled` — pas seulement cachées côté front, réellement
  absentes côté serveur, pour ne pas exposer une API qui référence des
  tables qui n'existent pas.
- L'onglet "Tournées" de la Mini App n'apparaît que si le backend expose ce
  module : un endpoint `/api/features` renvoie la configuration active au
  front, qui adapte dynamiquement ses onglets en conséquence — la Mini App
  devient elle-même pilotée par la configuration, plutôt que d'avoir une
  liste d'onglets fixe.
- Le libellé "Taille" dans l'onglet Catalogue devient
  `features.variants.label`, affiché tel quel dans les formulaires et les
  boutons du bot client.

### 4. Ce qui ne change pas

Il est important d'être aussi explicite sur ce qui **ne bouge pas** que sur
ce qui change — ça montre que le cœur du travail déjà fait (le respect du
principe données/logique) reste valable et n'a pas besoin d'être repris :

- `changeStatus()` / `orderFlow.ts` : le cycle de vie d'une commande
  (`pending → confirmed → delivering/ready → delivered`) reste le socle
  commun, quel que soit le métier — une commande a toujours un statut, que
  la remise se fasse par livraison ou par retrait.
- `catalog.ts`, `cart.ts`, `customers.ts` (hors calcul de fiabilité),
  `sessionStore.ts`, `messageTemplates.ts` : déjà génériques par
  construction, aucune modification nécessaire pour ce chantier.

## Prochaines étapes concrètes

L'ordre proposé va du changement le moins risqué (purement déclaratif, sans
impact visible) vers le plus intégré (Mini App adaptative), pour pouvoir
valider à chaque étape que le comportement du client actuel n'a pas bougé
avant d'aller plus loin :

1. Créer `src/features.ts` avec l'interface `ClientFeatures` et la config du
   client actuel (pizzeria/livraison) — comportement strictement identique à
   aujourd'hui, juste explicité. Aucun autre fichier ne lit encore cette
   config à ce stade : c'est une étape purement additive et sans risque.
2. Rendre `orders.address` / `orders.phone` nullables (migration additive +
   types) — préparation du schéma, sans encore rien changer au
   comportement du checkout.
3. Sortir la création des tables `routes` / `route_templates` dans une
   fonction conditionnée par `features.deliverySlots.enabled`.
4. Adapter `checkout.ts` pour sauter les étapes désactivées (pattern
   ci-dessus) — c'est ici que la configuration commence réellement à piloter
   le comportement du bot.
5. Exposer `/api/features` et adapter la Mini App pour masquer l'onglet
   Tournées / adapter le libellé des variantes selon la configuration.
6. **Test de validation de l'hypothèse "cœur + modules"** : configurer un
   client fictif "boutique vêtements, retrait en boutique, sans tournées" et
   vérifier que le parcours complet (catalogue → panier → checkout →
   confirmation → admin) fonctionne **sans toucher au code du cœur** —
   seulement en changeant `features.ts`. Si une seule ligne de `catalog.ts`,
   `orderFlow.ts` ou `cart.ts` doit être modifiée pour que ce scénario
   fonctionne, c'est le signal qu'un point de couplage a été oublié dans les
   étapes précédentes, à corriger avant de considérer le chantier terminé.
