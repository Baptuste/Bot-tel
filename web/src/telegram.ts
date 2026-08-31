/**
 * Acces minimal au SDK Telegram Web Apps (charge via <script> dans index.html).
 * On ne se sert de `initDataUnsafe` que pour l'affichage : la seule identite qui
 * fait foi est celle revalidee cote serveur a partir de `initData`.
 */
interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; username?: string } };
  colorScheme: 'light' | 'dark';
  ready: () => void;
  expand: () => void;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback: (confirmed: boolean) => void) => void;
  HapticFeedback?: {
    notificationOccurred: (type: 'success' | 'warning' | 'error') => void;
    impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    selectionChanged?: () => void;
  };
  MainButton: {
    setParams: (p: {
      text?: string;
      color?: string;
      text_color?: string;
      is_active?: boolean;
      is_visible?: boolean;
    }) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  close: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp };
  }
}

export const tg: TgWebApp | undefined = window.Telegram?.WebApp;

/** initData brut a transmettre au backend pour l'authentification. */
export const initData: string = tg?.initData ?? '';

export function initTelegram(): void {
  tg?.ready();
  tg?.expand();
}

/** Confirmation native Telegram (fallback sur window.confirm hors Telegram). */
export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (tg?.showConfirm) tg.showConfirm(message, resolve);
    else resolve(window.confirm(message));
  });
}

export function alertDialog(message: string): void {
  if (tg?.showAlert) tg.showAlert(message);
  else window.alert(message);
}

/** Saisie courte (raison d'annulation...). null = annule. */
export function promptDialog(message: string): string | null {
  try {
    return window.prompt(message);
  } catch {
    return '';
  }
}

export function haptic(type: 'success' | 'warning' | 'error'): void {
  tg?.HapticFeedback?.notificationOccurred(type);
}
export function tap(): void {
  tg?.HapticFeedback?.selectionChanged?.();
}
