import { useEffect, useState } from 'react';
import { Catalog } from './Catalog';
import { Customers } from './Customers';
import { FeaturesContext } from './features';
import { Orders } from './Orders';
import { Routes } from './Routes';
import type { ClientFeatures } from './types';

type Tab = 'orders' | 'routes' | 'catalog' | 'customers';

export function AdminApp({ features }: { features: ClientFeatures }) {
  const [tab, setTab] = useState<Tab>('orders');

  useEffect(() => {
    document.title = `${features.displayName} · Admin`;
  }, [features.displayName]);

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
