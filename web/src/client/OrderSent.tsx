import { useBackButton, useMainButton } from './hooks';
import { tg } from '../telegram';

interface Props {
  orderId: number;
  onOrders: () => void;
}

export function OrderSent({ orderId, onOrders }: Props) {
  useBackButton(null);
  useMainButton({
    text: 'Fermer',
    onClick: () => (tg ? tg.close() : onOrders()),
  });

  return (
    <div className="shop sent">
      <div className="sent__mark">✓</div>
      <h1 className="sent__title">Commande #{orderId} envoyée</h1>
      <p className="sent__text">
        La boutique vient de la recevoir. Tu reçois la confirmation et le suivi
        directement dans la conversation.
      </p>
      <button className="linkback" onClick={onOrders}>
        Voir mes commandes
      </button>
    </div>
  );
}
