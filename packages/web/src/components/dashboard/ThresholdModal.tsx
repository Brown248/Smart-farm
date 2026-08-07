import { useEffect, useState } from 'react';
import { Icon } from '@/components/common/Icon';
import { SENSOR_DEFS } from '@/data/dashboard';
import type { SensorKey, Threshold } from '@/data/dashboard';
import { useI18n } from '@/i18n/useI18n';
import m from './modals.module.css';

export interface ThresholdModalProps {
  /** null = ปิดอยู่ */
  readonly sensorKey: SensorKey | null;
  readonly current: Threshold;
  readonly onCancel: () => void;
  readonly onSave: (key: SensorKey, next: Threshold) => void;
}

/**
 * ตั้งเกณฑ์แจ้งเตือนของเซนเซอร์หนึ่งตัว
 *
 * ค่าที่บันทึกมีผลจริงกับการ์ดเซนเซอร์ (เปลี่ยนสี/ป้ายสถานะ) — ปุ่มบันทึกไม่ใช่ปุ่มหลอก
 * เกณฑ์นี้แยกจากเงื่อนไข automation การรดน้ำโดยตั้งใจ
 */
export function ThresholdModal({ sensorKey, current, onCancel, onSave }: ThresholdModalProps) {
  const { t } = useI18n();
  const [warn, setWarn] = useState(String(current.warn));
  const [crit, setCrit] = useState(String(current.crit));

  // เปิดใหม่ทุกครั้ง = โหลดค่าที่บันทึกไว้ล่าสุดของเซนเซอร์ตัวนั้น
  useEffect(() => {
    setWarn(String(current.warn));
    setCrit(String(current.crit));
  }, [sensorKey, current.warn, current.crit]);

  useEffect(() => {
    if (!sensorKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sensorKey, onCancel]);

  if (!sensorKey) return null;

  const def = SENSOR_DEFS.find((d) => d.key === sensorKey);
  const parse = (raw: string, fallback: number) => {
    const n = Number(raw);
    return raw.trim() === '' || Number.isNaN(n) ? fallback : n;
  };

  return (
    <div className={m.overlay} role="dialog" aria-modal="true" aria-label={t.thresholdTitle}>
      <button
        type="button"
        className={m.scrim}
        aria-label={t.close}
        tabIndex={-1}
        onClick={onCancel}
      />
      <div className={m.panel}>
        <div className={m.head}>
          <span className={m.headIcon} style={{ background: '#e7efe9' }} aria-hidden="true">
            <Icon name="sliders" size={20} color="var(--brand-green)" strokeWidth={1.8} />
          </span>
          <div>
            <h2 className={m.title}>{t.thresholdTitle}</h2>
            <div className={m.subtitle}>{def ? t[def.labelKey] : ''}</div>
          </div>
          <button type="button" className={m.close} aria-label={t.close} onClick={onCancel}>
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>

        <p className={m.hint}>{t.thresholdHint}</p>

        <div className={m.fields}>
          <div className={m.field}>
            <span
              className={m.fieldDot}
              style={{ background: 'var(--d-warn)' }}
              aria-hidden="true"
            />
            <label className={m.fieldLabel} htmlFor="th-warn">
              {t.warnBelow}
            </label>
            <input
              id="th-warn"
              className={m.numInput}
              type="number"
              inputMode="decimal"
              value={warn}
              onChange={(e) => setWarn(e.target.value)}
            />
          </div>
          <div className={m.field}>
            <span
              className={m.fieldDot}
              style={{ background: 'var(--d-crit)' }}
              aria-hidden="true"
            />
            <label className={m.fieldLabel} htmlFor="th-crit">
              {t.critBelow}
            </label>
            <input
              id="th-crit"
              className={m.numInput}
              type="number"
              inputMode="decimal"
              value={crit}
              onChange={(e) => setCrit(e.target.value)}
            />
          </div>
        </div>

        <div className={m.actions}>
          <button type="button" className={m.cancelBtn} onClick={onCancel}>
            {t.cancel}
          </button>
          <button
            type="button"
            className={m.saveBtn}
            onClick={() =>
              onSave(sensorKey, {
                warn: parse(warn, current.warn),
                crit: parse(crit, current.crit),
              })
            }
          >
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
