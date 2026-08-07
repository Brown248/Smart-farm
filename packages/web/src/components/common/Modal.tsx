import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import styles from './Modal.module.css';

export type ModalVariant = 'center' | 'wide' | 'sheet' | 'drawer';

export interface ModalProps {
  readonly open: boolean;
  readonly variant?: ModalVariant | undefined;
  readonly title?: ReactNode;
  readonly closeLabel?: string | undefined;
  /** ไม่ส่งมา = ปิดด้วยการแตะฉากหลัง/Esc ไม่ได้ (ใช้กับกล่องยืนยัน) */
  readonly onClose?: (() => void) | undefined;
  readonly zIndex?: number | undefined;
  readonly labelledBy?: string | undefined;
  readonly children?: ReactNode;
}

const OVERLAY_CLASS: Record<ModalVariant, string | undefined> = {
  center: styles.overlayCenter,
  wide: styles.overlayCenter,
  sheet: styles.overlaySheet,
  drawer: styles.overlayDrawer,
};

const PANEL_CLASS: Record<ModalVariant, string | undefined> = {
  center: styles.center,
  wide: styles.wide,
  sheet: styles.sheet,
  drawer: styles.drawer,
};

export function Modal({
  open,
  variant = 'center',
  title,
  closeLabel,
  onClose,
  zIndex = 70,
  labelledBy,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const overlayStyle: CSSProperties = { zIndex };

  return (
    <div
      className={[styles.overlay, OVERLAY_CLASS[variant]].filter(Boolean).join(' ')}
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      {onClose ? (
        <button
          type="button"
          className={styles.scrim}
          aria-label={closeLabel}
          tabIndex={-1}
          onClick={onClose}
        />
      ) : null}
      <div className={[styles.panel, PANEL_CLASS[variant]].filter(Boolean).join(' ')}>
        {title != null ? (
          <div className={styles.header}>
            <strong className={styles.title}>{title}</strong>
            <div className={styles.spacer} />
            {onClose ? (
              <button
                type="button"
                className={styles.close}
                aria-label={closeLabel}
                onClick={onClose}
              >
                ✕
              </button>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
