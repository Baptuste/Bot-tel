import { useEffect, useState } from 'react';
import { api } from './api';
import { Catalog } from './Catalog';
import { Customers } from './Customers';
import { FeaturesContext } from './features';
import { Orders } from './Orders';
import { Routes } from './Routes';
import { initData } from './telegram';
import type { ClientFeatures } from './types';

type Tab = 'orders' | 'routes' | 'catalog' | 'customers';

export function App() {
  const [tab, setTab] = useState<Tab>('orders');
  const [features, setFeatures] = useState<ClientFeatures | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initData) return;
    void api
      .features()
      .then(setFeatures)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (features) document.title = `${features.displayName} · Admin`;
  }, [features]);

  if (!initData) {
    return (
      <div className="error">
        Ouvre cette page depuis le bot Telegram (bouton &laquo; Ouvrir l'admin &raquo;).
      </div>
    );
  }

  if (error) return <div className="error">Chargement impossible : {error}</div>;
  if (!features) return <p className="muted">Chargement…</p>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'orders', label: 'Commandes' },
    ...(features.deliverySlots.enabled ? [{ key: 'routes' as const, label: 'Tournées' }] : []),
    { key: 'catalog', label: 'Catalogue' },
    ...(features.reliability.enabled ? [{ key: 'customers' as const, label: 'Clients' }] : []),
  ];

  // La config a pu retirer l'onglet actuellement selectionne.
  const active = tabs.some((t) => t.key === tab) ? tab : 'orders';

  return (
    <FeaturesContext.Provider value={features}>
      <header className="appbar">
        <span className="appbar__name">{features.displayName}</span>
        <span className="appbar__tag">Admin</span>
      </header>
      <nav className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={active === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {active === 'orders' && <Orders />}
      {active === 'routes' && <Routes />}
      {active === 'catalog' && <Catalog />}
      {active === 'customers' && <Customers />}
    </FeaturesContext.Provider>
  );
}
