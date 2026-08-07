import { Icon } from '@/components/common/Icon';
import { HEALTH_STEP_KEYS } from '@/data/dashboard';
import { useI18n } from '@/i18n/useI18n';
import m from './modals.module.css';

export interface SensorHealthModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** รับทราบแล้ว = ซ่อนแบนเนอร์เตือนด้านบนด้วย */
  readonly onAcknowledge: () => void;
}

export function SensorHealthModal({ open, onClose, onAcknowledge }: SensorHealthModalProps) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div className={m.overlay} role="dialog" aria-modal="true" aria-label={t.healthTitle}>
      <button
        type="button"
        className={m.scrim}
        aria-label={t.close}
        tabIndex={-1}
        onClick={onClose}
      />
      <div className={m.panel}>
        <div className={m.head}>
          <span
            className={m.headIcon}
            style={{ background: 'var(--d-warn-bg)' }}
            aria-hidden="true"
          >
            <Icon name="clock" size={20} color="#9a5e0c" strokeWidth={1.8} />
          </span>
          <h2 className={m.title}>{t.healthTitle}</h2>
          <button type="button" className={m.close} aria-label={t.close} onClick={onClose}>
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>

        <div className={m.healthCard}>
          <div className={m.healthCardTitle}>{t.healthCardTitle}</div>
          <div className={m.healthCardBody}>{t.healthCardBody}</div>
        </div>

        <div className={m.steps}>
          <div className={m.stepsTitle}>{t.healthStepsTitle}</div>
          {HEALTH_STEP_KEYS.map((key, i) => (
            <div key={key} className={m.step}>
              <span className={m.stepNum}>{i + 1}</span>
              {t[key]}
            </div>
          ))}
        </div>

        <button type="button" className={m.ackBtn} onClick={onAcknowledge}>
          {t.acknowledge}
        </button>
      </div>
    </div>
  );
}
