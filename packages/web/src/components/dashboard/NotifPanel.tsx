import { useFarmAlerts } from '@/hooks/useFarmAlerts';
import { useI18n } from '@/i18n/useI18n';
import m from './modals.module.css';

export interface NotifPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function NotifPanel({ open, onClose }: NotifPanelProps) {
  const { t } = useI18n();
  // แจ้งเตือนอิงค่าจริงเมื่อ live · mock เมื่อ token หมด (ดู useFarmAlerts)
  const { items } = useFarmAlerts();
  if (!open) return null;

  return (
    <div className={m.notifOverlay} role="dialog" aria-modal="true" aria-label={t.notifTitle}>
      <button
        type="button"
        className={m.scrim}
        aria-label={t.close}
        tabIndex={-1}
        onClick={onClose}
      />
      <div className={m.notifPanel}>
        <div className={m.notifTitle}>{t.notifTitle}</div>
        {items.length === 0 ? <div className={m.notifTime}>{t.alertNone}</div> : null}
        {items.map((n) => (
          <div key={n.id} className={m.notifRow}>
            <span className={m.notifDot} aria-hidden="true" style={{ background: n.color }} />
            <div style={{ flex: 1 }}>
              <div className={m.notifText}>{n.text}</div>
              <div className={m.notifTime}>{n.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
