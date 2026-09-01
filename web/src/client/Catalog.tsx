import { useMainButton } from './hooks';
import { tap } from '../telegram';
import { placeholderGlyph } from './util';
import type { CartDto, Menu, ShopConfig } from './types';

interface Props {
  menu: Menu;
  config: ShopConfig;
  cart: CartDto;
  onOpen: (catId: string, prodId: string) => void;
  onQuickAdd: (catId: string, prodId: string) => void;
  onCart: () => void;
  onOrders: () => void;
}

export function Catalog({ menu, config, cart, onOpen, onQuickAdd, onCart, onOrders }: Props) {
  useMainButton({ text: `🛒 Panier · ${cart.total} €`, onClick: onCart, visible: cart.count > 0 });

  const cats = Object.entries(menu);

  return (
    <div className="shop">
      <header className="shop-head">
        <div>
          <div className="shop-name">{config.displayName}</div>
          <div className="shop-sub">
            {config.fulfillment === 'pickup' ? 'Commande en ligne · retrait' : 'Livraison & retrait'}
          </div>
        </div>
        <button className="shop-head__link" onClick={onOrders}>
          Mes commandes
        </button>
      </header>

      {cats.length === 0 && <p className="empty">La carte est momentanément vide.</p>}

      {cats.map(([catId, cat]) => (
        <section key={catId} className="shop-cat">
          <h2 className="shop-cat__title">{cat.label}</h2>
          <div className="prod-grid">
            {Object.entries(cat.items).map(([prodId, item]) => {
              const hasVariants = item.variants.length > 0;
              return (
                <article
                  key={prodId}
                  className="pcard"
                  onClick={() => {
                    tap();
                    onOpen(catId, prodId);
                  }}
                >
                  <div className={`pcard__media ${item.image ? '' : 'noimg'}`}>
                    {item.image ? (
                      <img src={`/uploads/${item.image}`} alt="" loading="lazy" />
                    ) : (
                      <span className="pcard__mono">{placeholderGlyph(cat.label, item.label)}</span>
                    )}
                  </div>
                  <div className="pcard__body">
                    <div className="pcard__name">{item.label}</div>
                    <div className="pcard__foot">
                      <span className="pcard__price">
                        {hasVariants && <span className="from">dès </span>}
                        {item.price} €
                      </span>
                      <button
                        className="pcard__add"
                        aria-label={hasVariants ? 'Choisir' : 'Ajouter'}
                        onClick={(e) => {
                          e.stopPropagation();
                          tap();
                          hasVariants ? onOpen(catId, prodId) : onQuickAdd(catId, prodId);
                        }}
                      >
                        {hasVariants ? '›' : '+'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {(config.contact.phone || config.contact.address || config.contact.hours) && (
        <footer className="shop-contact">
          <span className="shop-contact__name">{config.displayName}</span>
          {config.contact.phone && (
            <a href={`tel:${config.contact.phone.replace(/\s/g, '')}`}>
              ☎ {config.contact.phone}
            </a>
          )}
          {config.contact.hours && <span>{config.contact.hours}</span>}
          {config.contact.address && <span>{config.contact.address}</span>}
        </footer>
      )}
    </div>
  );
}
