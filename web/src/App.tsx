import { useEffect, useState } from 'react';
import { api } from './api';
import { AdminApp } from './AdminApp';
import { ClientApp } from './client/ClientApp';
import { initData } from './telegram';
import type { ClientFeatures } from './types';

/**
 * Routeur : une seule Mini App, deux visages.
 * `GET /api/features` répond 200 pour un admin, 403 (`not_admin`) sinon.
 */
type State =
  | { mode: 'no-tg' }
  | { mode: 'loading' }
  | { mode: 'admin'; features: ClientFeatures }
  | { mode: 'client' }
  | { mode: 'error'; message: string };

export function App() {
  const [state, setState] = useState<State>(initData ? { mode: 'loading' } : { mode: 'no-tg' });

  useEffect(() => {
    if (!initData) return;
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
