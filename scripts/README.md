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
