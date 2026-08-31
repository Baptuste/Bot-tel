import { useState } from 'react';
import { api } from './api';
import { DriverSelect } from './DriverSelect';
import { useFeatures } from './features';
import { alertDialog, confirmDialog } from './telegram';
import type { Driver, RouteTemplate } from './types';

interface Props {
  templates: RouteTemplate[];
  drivers: Driver[];
  busy: boolean;
  onChange: () => Promise<void> | void;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function RouteTemplates({ templates, drivers, busy, onChange }: Props) {
  const deliverySlots = useFeatures().deliverySlots;
  const withDrivers = deliverySlots.drivers;
  const capHint =
    deliverySlots.capacityLimit != null
      ? `Capacite max (defaut : ${deliverySlots.capacityLimit})`
      : 'Capacite max (optionnel)';
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('');
  const [capacity, setCapacity] = useState('');
  const [driver, setDriver] = useState<number | null>(null);
  const [working, setWorking] = useState(false);

  const driverName = (id: number | null) => drivers.find((d) => d.id === id)?.name ?? null;

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
    if (!label.trim() || !TIME_RE.test(time)) {
      alertDialog('Libelle requis et heure au format HH:MM.');
      return;
    }
    await run(() =>
      api.routes.addTemplate({
        label: label.trim(),
        time,
        max_capacity: capacity ? Number(capacity) : null,
        driver_id: withDrivers ? driver : null,
      }),
    );
    setLabel('');
    setTime('');
    setCapacity('');
    setDriver(null);
  }

  const disabled = busy || working;

  return (
    <div className="card">
      <div className="row">
        <strong>Modeles de creneaux</strong>
        <button className="link" onClick={() => setOpen((v) => !v)}>
          {open ? 'Masquer' : 'Gerer'}
        </button>
      </div>
      <p className="muted small">
        Les tournees du jour sont generees automatiquement a partir des modeles actifs.
      </p>

      {open && (
        <>
          {templates.map((t) => (
            <div key={t.id} className={`product ${t.active ? '' : 'off'}`}>
              <div>
                {t.label} <span className="muted">- {t.time}</span>
                {t.max_capacity != null && (
                  <span className="muted small"> - max {t.max_capacity}</span>
                )}
                {withDrivers && driverName(t.driver_id) && (
                  <span className="muted small"> - {driverName(t.driver_id)}</span>
                )}
                {withDrivers && (
                  <div style={{ marginTop: 4 }}>
                    <DriverSelect
                      drivers={drivers}
                      value={t.driver_id}
                      disabled={disabled}
                      onChange={(id) =>
                        void run(() => api.routes.updateTemplate(t.id, { driver_id: id }))
                      }
                    />
                  </div>
                )}
              </div>
              <div className="product-actions">
                <button
                  className="mini"
                  disabled={disabled}
                  onClick={() =>
                    void run(() => api.routes.updateTemplate(t.id, { active: !t.active }))
                  }
                >
                  {t.active ? 'Actif' : 'Inactif'}
                </button>
                <button
                  className="mini danger"
                  disabled={disabled}
                  onClick={async () => {
                    if (await confirmDialog(`Supprimer le modele "${t.label}" ?`)) {
                      await run(() => api.routes.deleteTemplate(t.id));
                    }
                  }}
                >
                  Suppr.
                </button>
              </div>
            </div>
          ))}

          <div style={{ marginTop: 10 }}>
            <div className="label">Nouveau modele</div>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Soir" />
            <input
              style={{ marginTop: 6 }}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="18:00"
            />
            <input
              style={{ marginTop: 6 }}
              type="number"
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder={capHint}
            />
            {withDrivers && (
              <div style={{ marginTop: 6 }}>
                <DriverSelect drivers={drivers} value={driver} onChange={setDriver} disabled={disabled} />
              </div>
            )}
            <button
              className="btn secondary"
              style={{ marginTop: 8 }}
              disabled={disabled}
              onClick={() => void add()}
            >
              Ajouter le modele
            </button>
          </div>
        </>
      )}
    </div>
  );
}
