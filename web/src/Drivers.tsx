import { useState } from 'react';
import { api } from './api';
import { alertDialog, confirmDialog } from './telegram';
import type { Driver } from './types';

interface Props {
  drivers: Driver[];
  busy: boolean;
  onChange: () => Promise<void> | void;
}

export function Drivers({ drivers, busy, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [working, setWorking] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setWorking(true);
    try {
      await action();
      await onChange();
    } catch (e) {
      alertDialog(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setWorking(false);
    }
  }

  async function add() {
    if (!name.trim()) {
      alertDialog('Nom du livreur requis.');
      return;
    }
    await run(() => api.drivers.create(name.trim(), phone.trim() || undefined));
    setName('');
    setPhone('');
  }

  const disabled = busy || working;
  const activeCount = drivers.filter((d) => d.active).length;

  return (
    <div className="card">
      <div className="row">
        <strong>Livreurs</strong>
        <button className="link" onClick={() => setOpen((v) => !v)}>
          {open ? 'Masquer' : `Gerer (${activeCount})`}
        </button>
      </div>
      <p className="muted small">
        Affecte un livreur a une tournee (ou par defaut sur un modele de creneau).
      </p>

      {open && (
        <>
          {drivers.map((d) => (
            <div key={d.id} className={`product ${d.active ? '' : 'off'}`}>
              <div>
                {d.name}
                {d.phone && <span className="muted small"> - {d.phone}</span>}
              </div>
              <div className="product-actions">
                <button
                  className="mini"
                  disabled={disabled}
                  onClick={() => void run(() => api.drivers.update(d.id, { active: !d.active }))}
                >
                  {d.active ? 'Actif' : 'Inactif'}
                </button>
                <button
                  className="mini danger"
                  disabled={disabled}
                  onClick={async () => {
                    if (await confirmDialog(`Supprimer le livreur "${d.name}" ?`)) {
                      await run(() => api.drivers.remove(d.id));
                    }
                  }}
                >
                  Suppr.
                </button>
              </div>
            </div>
          ))}

          <div style={{ marginTop: 10 }}>
            <div className="label">Nouveau livreur</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" />
            <input
              style={{ marginTop: 6 }}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Telephone (optionnel)"
            />
            <button
              className="btn secondary"
              style={{ marginTop: 8 }}
              disabled={disabled}
              onClick={() => void add()}
            >
              Ajouter le livreur
            </button>
          </div>
        </>
      )}
    </div>
  );
}
