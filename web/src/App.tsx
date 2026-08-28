import { useState } from 'react';
import { Catalog } from './Catalog';
import { Customers } from './Customers';
import { Orders } from './Orders';
import { Routes } from './Routes';
import { initData } from './telegram';

type Tab = 'orders' | 'routes' | 'catalog' | 'customers';

const TABS: { key: Tab; label: string }[] = [
  { key: 'orders', label: 'Commandes' },
  { key: 'routes', label: 'Tournées' },
  { key: 'catalog', label: 'Catalogue' },
  { key: 'customers', label: 'Clients' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('orders');

  if (!initData) {
    return (
      <div className="error">
        Ouvre cette page depuis le bot Telegram (bouton &laquo; Ouvrir l'admin &raquo;).
      </div>
    );
  }

  return (
    <>
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'orders' && <Orders />}
      {tab === 'routes' && <Routes />}
      {tab === 'catalog' && <Catalog />}
      {tab === 'customers' && <Customers />}
    </>
  );
}
