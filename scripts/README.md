# scripts/

## `smoke.mts` — test de fumée de l'API

Vérifie de bout en bout, sans passer par l'interface Telegram :
authentification `initData` (bon / mauvais / trafiqué / non-admin), CRUD catalogue
(catégories, produits, variantes, images), modèles et tournées, le flux complet
d'une commande (`pending → confirmed → delivering → delivered`, garde-fous 409),
et la persistance des sessions (TTL + purge).

```powershell
npm run dev        # dans un terminal : le bot + l'API doivent tourner
npm run smoke      # dans un autre
```

Le script crée puis **supprime** toutes ses données de test. Le flux de statut envoie
de **vrais messages Telegram** au client de la commande de test (le compte admin).

## `boutique.mts` — validation « cœur + modules »

Étape 6 du plan [`coeur-et-modules.md`](../docs/coeur-et-modules.md). Configure un
client fictif « boutique de vêtements, retrait en magasin, sans tournées »
(entrée `boutique-demo` de `src/features.ts`) et vérifie le parcours complet
(catalogue → panier → commande sans adresse → rendu → dashboard) **sans toucher
au cœur** (`catalog.ts` / `cart.ts` / `orderFlow.ts`).

```powershell
npm run test:boutique
```

In-process, **ne nécessite pas le bot lancé**. Base isolée `data/boutique-test.db`,
recréée puis supprimée à chaque run. Pose `CLIENT_ID=boutique-demo` + `DB_PATH`
avant de charger les modules (imports dynamiques).

## `journee.mts` — simulation d'une journée complète

```powershell
npm run test:journee
```

Rejoue une **journée type de la pizzeria** : 20 clients, 3 livreurs, 3 tournées
du soir, confirmations / refus / affectations / réordonnancement / départ des
tournées / livraisons / 2 no-shows / 3 re-commandes. Vérifie les invariants de
fin de journée (répartition des statuts, CA = somme des livrées, tableau de bord,
taux de fiabilité impacté par les no-shows, notifications client) et **affiche le
bilan** (CA, livrées par livreur, top produits).

In-process (faux `telegram` qui collecte les messages), base isolée
`data/journee-test.db` recréée/supprimée à chaque run.

## `creneaux.mts` — créneaux à capacité limitée

```powershell
npm run test:creneaux
```

Vérifie qu'un créneau plein disparaît des choix du client, que le nombre de
places restantes est correct, et que la capacité par défaut du client
(`features.deliverySlots.capacityLimit`) s'applique aux créneaux sans capacité
propre. In-process, base isolée `data/creneaux-test.db`.

## `loyalty.mts` — programme de fidélité

```powershell
npm run test:loyalty
```

Client `boutique-demo` (fidélité activée). Vérifie que les points sont crédités
quand une commande atteint le rôle `fulfilled`, que le palier déclenche une
notification client, et que `redeemReward` retire un palier du solde. In-process,
base isolée `data/loyalty-test.db`.

## `referral.mts` — parrainage

```powershell
npm run test:referral
```

Client `boutique-demo` (parrainage activé). Vérifie l'enregistrement d'un
filleul (+ refus : auto-parrainage, code bidon, double enregistrement), la
réduction appliquée à sa première commande, la création du crédit parrain et sa
consommation (y compris partielle). In-process, base isolée
`data/referral-test.db`.
