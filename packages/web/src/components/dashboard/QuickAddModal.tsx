import { useState } from 'react';
import { Icon } from '@/components/common/Icon';
import { LOG_CATS, LOG_CAT_META } from '@/data/mockActivityLog';
import type { LogCat } from '@/data/mockActivityLog';
import { useI18n } from '@/i18n/useI18n';
import m from './modals.module.css';

export interface QuickAddModalProps {
  readonly open: boolean;
  readonly onCancel: () => void;
  readonly onSave: (cat: LogCat, note: string) => void;
}

/** บันทึกกิจกรรมแบบเร็ว — เพิ่มรายการเข้าไทม์ไลน์จริง */
export function QuickAddModal({ open, onCancel, onSave }: QuickAddModalProps) {
  const { t } = useI18n();
  const [cat, setCat] = useState<LogCat>('water');
  const [note, setNote] = useState('');

  if (!open) return null;

  const submit = () => {
    onSave(cat, note.trim());
    setNote('');
  };

  return (
    <div
      className={m.overlay}
      style={{ zIndex: 72 }}
      role="dialog"
      aria-modal="true"
      aria-label={t.quickAdd}
    >
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
            <Icon name="plus" size={20} color="var(--brand-green)" strokeWidth={1.9} />
          </span>
          <h3 className={m.title}>{t.quickAdd}</h3>
          <button type="button" className={m.close} aria-label={t.close} onClick={onCancel}>
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>

        <p className={m.hint} style={{ marginTop: 13 }}>
          {t.quickAddHint}
        </p>

        <div className={m.catRow}>
          {LOG_CATS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cat === c}
              className={[m.catBtn, cat === c ? m.catBtnOn : null].filter(Boolean).join(' ')}
              onClick={() => setCat(c)}
            >
              {t[LOG_CAT_META[c].labelKey]}
            </button>
          ))}
        </div>

        <input
          className={m.textInput}
          value={note}
          placeholder={t.quickAddPlaceholder}
          aria-label={t.quickAddPlaceholder}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />

        <div className={m.autoNote}>
          <Icon name="clock" size={14} strokeWidth={1.9} />
          {t.quickAddAuto}
        </div>

        <div className={m.actions}>
          <button type="button" className={m.cancelBtn} onClick={onCancel}>
            {t.cancel}
          </button>
          <button type="button" className={m.saveBtn} onClick={submit}>
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
