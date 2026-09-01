import { useEffect } from 'react';
import { tg } from '../telegram';

/** Pilote le bouton principal natif de Telegram pour l'écran courant. */
export function useMainButton(opts: {
  text: string;
  onClick: () => void;
  visible?: boolean;
  loading?: boolean;
}): void {
  const { text, onClick, visible = true, loading = false } = opts;
  useEffect(() => {
    const mb = tg?.MainButton;
    if (!mb) return;
    mb.setParams({ text, is_visible: visible, is_active: !loading });
    if (loading) mb.showProgress(true);
    else mb.hideProgress();
    mb.onClick(onClick);
    return () => {
      mb.offClick(onClick);
    };
  }, [text, onClick, visible, loading]);
}

/** Masque le bouton principal pour un écran qui n'en a pas (historique…). */
export function useNoMainButton(): void {
  useEffect(() => {
    tg?.MainButton?.hide();
  }, []);
}

/** Bouton retour natif ; `null` pour le masquer (écran racine). */
export function useBackButton(onBack: (() => void) | null): void {
  useEffect(() => {
    const bb = tg?.BackButton;
    if (!bb) return;
    if (!onBack) {
      bb.hide();
      return;
    }
    bb.show();
    bb.onClick(onBack);
    return () => {
      bb.offClick(onBack);
      bb.hide();
    };
  }, [onBack]);
}
