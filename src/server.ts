/**
 * Serveur HTTP : sert l'API admin ET la Mini App (fichiers statiques buildes).
 *
 * Il tourne dans le MEME process que le bot -> il partage directement la base
 * SQLite et les modules metier, et il peut envoyer des messages via `bot.telegram`.
 * Une seule URL publique (le tunnel) suffit pour tout.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Telegram } from 'telegraf';
import { catalogRouter } from './api/catalog';
import { customersRouter } from './api/customers';
import { dashboardRouter } from './api/dashboard';
import { driversRouter } from './api/drivers';
import { featuresRouter } from './api/features';
import { ordersRouter } from './api/orders';
import { routesRouter } from './api/routes';
import { templatesRouter } from './api/templates';
import { features } from './features';
import { UPLOADS_DIR } from './uploads';

const WEB_DIST = path.resolve(process.cwd(), 'web', 'dist');

export function createServer(telegram: Telegram): express.Express {
  const app = express();
  // Limite large : les images produits arrivent en base64 dans le corps JSON.
  app.use(express.json({ limit: '10mb' }));

  // Images produits (uploadees via la Mini App).
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '1h' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, webBuilt: existsSync(WEB_DIST) });
  });

  app.use('/api/features', featuresRouter());
  app.use('/api/orders', ordersRouter(telegram));
  app.use('/api/catalog', catalogRouter());
  app.use('/api/customers', customersRouter());
  app.use('/api/dashboard', dashboardRouter());
  app.use('/api/templates', templatesRouter()); // modeles de MESSAGES (pas les tournees)

  // Module tournees : monte seulement si le client l'a active. Pour un client en
  // retrait boutique, /api/routes n'existe pas (elle reference des tables
  // absentes de sa base).
  if (features.deliverySlots.enabled) {
    app.use('/api/routes', routesRouter(telegram));
    if (features.deliverySlots.drivers) app.use('/api/drivers', driversRouter());
  }

  // Toute route /api inconnue -> 404 JSON (et pas le fallback SPA).
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // Mini App (React buildee).
  if (existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(WEB_DIST, 'index.html'));
    });
  } else {
    app.get('*', (_req, res) => {
      res
        .status(200)
        .type('html')
        .send('<p>Mini App pas encore buildee. Lance <code>npm run build:web</code>.</p>');
    });
  }

  return app;
}
