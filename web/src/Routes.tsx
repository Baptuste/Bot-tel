import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Drivers } from './Drivers';
import { DriverSelect } from './DriverSelect';
import { useFeatures } from './features';
import { RouteOrderRow } from './RouteOrderRow';
import { RouteTemplates } from './RouteTemplates';
import { alertDialog, confirmDialog } from './telegram';
import {
  ROUTE_STATUS_LABEL,
  STATUS_LABEL,
  type Driver,
  type Order,
  type RouteTemplate,
  type RouteWithOrders,
} from './types';

const today = () => new Date().toISOString().slice(0, 10);

export function Routes() {
  const withDrivers = useFeatures().deliverySlots.drivers;

  const [templates, setTemplates] = useState<RouteTemplate[]>([]);
  const [routes, setRoutes] = useState<RouteWithOrders[]>([]);
  const [assignable, setAssignable] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(today());
  const [slot, setSlot] = useState('');
  const [newDriver, setNewDriver] = useState<number | null>(null);
  const [filterDriver, setFilterDriver] = useState<number | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, drv] = await Promise.all([
        api.routes.list(),
        withDrivers ? api.drivers.list() : Promise.resolve({ drivers: [] }),
      ]);
      setTemplates(data.templates);
      setRoutes(data.routes);
      setAssignable(data.assignable);
      setDrivers(drv.drivers);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [withDrivers]);

  useEffect(() => {
    void load();
  }, [load]);

  async function guard(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      alertDialog(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function createRoute() {
    if (!slot.trim()) return;
    await guard(() => api.routes.create(date, slot.trim(), withDrivers ? newDriver : null));
    setSlot('');
    setNewDriver(null);
  }

  async function start(r: RouteWithOrders) {
    if (await confirmDialog(`Demarrer la tournee (${r.orders.length} commande(s)) ?\nLes clients seront notifies.`)) {
      await guard(() => api.routes.start(r.id));
    }
  }

  async function finish(r: RouteWithOrders) {
    if (await confirmDialog('Terminer la tournee ? Les commandes en cours passent en "livree".')) {
      await guard(() => api.routes.finish(r.id));
    }
  }

  async function remove(r: RouteWithOrders) {
    if (await confirmDialog('Supprimer cette tournee ? Ses commandes redeviennent non affectees.')) {
      await guard(() => api.routes.remove(r.id));
    }
  }

  const shownRoutes =
    filterDriver === 'all'
      ? routes
      : routes.filter((r) => (filterDriver === 0 ? r.driver_id == null : r.driver_id === filterDriver));

  return (
    <>
      <h1>Tournees</h1>
      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Chargement...</p>}

      {withDrivers && <Drivers drivers={drivers} busy={busy} onChange={load} />}
      <RouteTemplates templates={templates} drivers={drivers} busy={busy} onChange={load} />

      <div className="card">
        <div className="label" style={{ marginBottom: 6 }}>
          Nouvelle tournee ponctuelle
        </div>
        <div className="field">
          <div className="label">Date</div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <div className="label">Creneau</div>
          <input value={slot} onChange={(e) => setSlot(e.target.value)} placeholder="18:00-20:00" />
        </div>
        {withDrivers && (
          <div className="field">
            <div className="label">Livreur</div>
            <DriverSelect drivers={drivers} value={newDriver} onChange={setNewDriver} disabled={busy} />
          </div>
        )}
        <button
          className="btn secondary"
          style={{ marginTop: 8 }}
          disabled={busy || !slot.trim()}
          onClick={() => void createRoute()}
        >
          Creer la tournee
        </button>
      </div>

      {withDrivers && routes.length > 0 && (
        <div className="field">
          <div className="label">Filtrer par livreur</div>
          <select
            value={filterDriver === 'all' ? 'all' : String(filterDriver)}
            onChange={(e) => setFilterDriver(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">Tous</option>
            <option value="0">Sans livreur</option>
            {drivers.filter((d) => d.active).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {routes.length === 0 && !loading && <p className="muted">Aucune tournee.</p>}

      {shownRoutes.map((r) => (
        <div key={r.id} className="card">
          <div className="row">
            <strong>
              {r.date} - {r.time_slot}
            </strong>
            <span className={`badge ${r.status}`}>{ROUTE_STATUS_LABEL[r.status]}</span>
          </div>
          {withDrivers && (
            <div className="muted small" style={{ marginBottom: 6 }}>
              Livreur : {r.driver?.name ?? 'non affecte'}
            </div>
          )}

          {r.orders.length === 0 && <p className="muted">Aucune commande affectee.</p>}
          {r.orders.map((o, i) => (
            <RouteOrderRow
              key={o.id}
              routeId={r.id}
              routeStatus={r.status}
              order={o}
              index={i}
              count={r.orders.length}
              busy={busy}
              run={guard}
            />
          ))}

          {r.status === 'planned' && (
            <>
              {withDrivers && (
                <div className="field" style={{ marginTop: 10 }}>
                  <div className="label">Livreur de cette tournee</div>
                  <DriverSelect
                    drivers={drivers}
                    value={r.driver_id}
                    disabled={busy}
                    onChange={(id) => void guard(() => api.routes.setDriver(r.id, id))}
                  />
                </div>
              )}

              {assignable.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="label">Ajouter une commande</div>
                  {assignable.map((o) => (
                    <div key={o.id} className="product">
                      <div>
                        #{o.id} <span className="muted">- {STATUS_LABEL[o.status]} - {o.total} EUR</span>
                        <div className="muted small">{o.address ?? 'retrait boutique'}</div>
                      </div>
                      <button
                        className="mini"
                        disabled={busy}
                        onClick={() => void guard(() => api.routes.assign(r.id, o.id))}
                      >
                        + Ajouter
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="actions">
                <button
                  className="btn"
                  disabled={busy || r.orders.length === 0}
                  onClick={() => void start(r)}
                >
                  Demarrer la tournee
                </button>
                <button className="btn secondary" disabled={busy} onClick={() => void remove(r)}>
                  Supprimer
                </button>
              </div>
            </>
          )}

          {r.status === 'started' && (
            <div className="actions">
              <button className="btn" disabled={busy} onClick={() => void finish(r)}>
                Terminer la tournee
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
