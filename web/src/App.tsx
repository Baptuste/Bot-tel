import { useEffect, useState } from 'react';
import { api } from './api';
import { AdminApp } from './AdminApp';
import { ClientApp } from './client/ClientApp';
import { initData } from './telegram';
import type { ClientFeatures } from './types';

/**
 * Routeur : une seule Mini App, deux visages.
 * `GET /api/features` répond 200 pour un admin, 403 (`not_admin`) sinon.
 * `?view=client` dans l'URL (bouton « Ouvrir la boutique » du bot) force la
 * vitrine, même pour un admin — pour prévisualiser depuis son propre compte.
 */
type State =
  | { mode: 'no-tg' }
  | { mode: 'loading' }
  | { mode: 'admin'; features: ClientFeatures }
  | { mode: 'client' }
  | { mode: 'error'; message: string };

const forceClient = new URLSearchParams(window.location.search).get('view') === 'client';

export function App() {
  const [state, setState] = useState<State>(
    !initData ? { mode: 'no-tg' } : forceClient ? { mode: 'client' } : { mode: 'loading' },
  );

  useEffect(() => {
    if (!initData || forceClient) return;
    void api
      .features()
      .then((features) => setState({ mode: 'admin', features }))
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        setState(message === 'not_admin' ? { mode: 'client' } : { mode: 'error', message });
      });
  }, []);

  switch (state.mode) {
    case 'no-tg':
      return <div className="error">Ouvre cette page depuis Telegram.</div>;
    case 'loading':
      return <p className="muted">Chargement…</p>;
    case 'error':
      return <div className="error">Chargement impossible : {state.message}</div>;
    case 'admin':
      return <AdminApp features={state.features} />;
    case 'client':
      return <ClientApp />;
  }
}
