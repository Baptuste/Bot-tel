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
