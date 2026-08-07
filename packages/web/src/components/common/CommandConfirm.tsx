import { Icon } from '@/components/common/Icon';
import type { ConfirmRequest } from '@/hooks/useConfirm';
import { useI18n } from '@/i18n/useI18n';
import m from '@/components/dashboard/modals.module.css';

export interface CommandConfirmProps {
  readonly request: ConfirmRequest | null;
  readonly onCancel: () => void;
  readonly onAccept: () => void;
}

/**
 * กล่องยืนยันคำสั่งของหน้าจอข้อมูล — เดิมก๊อปกันอยู่ 3 ที่ (ชลประทาน · โรงเรือน · ปุ่มหยุดฉุกเฉิน)
 *
 * ⚠️ ไม่ใช่ตัวเดียวกับ `common/ConfirmDialog.tsx` ซึ่งเป็นดีไซน์ของฉากเกม
 * (`Modal variant="center"` ปิดด้วยการแตะฉากหลังไม่ได้) หน้าจอข้อมูลในต้นแบบใช้แผงแบบนี้
 * จับสองอันมารวมกันคือการเบี่ยงจากต้นแบบ ไม่ใช่การลดโค้ดซ้ำ
 */
export function CommandConfirm({ request, onCancel, onAccept }: CommandConfirmProps) {
  const { t } = useI18n();
  if (!request) return null;

  const warn = request.tone === 'warn';

  return (
    <div
      className={m.overlay}
      style={{ zIndex: 80 }}
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
    >
      <button
        type="button"
        className={m.scrim}
        aria-label={t.close}
        tabIndex={-1}
        onClick={onCancel}
      />
      <div className={m.panel} style={{ maxWidth: 380 }}>
        <div className={m.head}>
          {/* โทนเตือน = ไอคอน/สีเตือน (เช่นตอน guard rule ทัก) · ปกติ = ข้อมูลสีเขียวน้ำ */}
          <span
            className={m.headIcon}
            style={{ background: warn ? 'var(--d-warn-bg)' : 'var(--d-m-hum-bg)' }}
            aria-hidden="true"
          >
            <Icon
              name={warn ? 'alert' : 'info'}
              size={21}
              color={warn ? 'var(--d-warn-ink-2)' : '#26746f'}
              strokeWidth={1.9}
            />
          </span>
          <h3 className={m.title}>{request.title}</h3>
        </div>
        <p className={m.hint}>{request.body}</p>
        <div className={m.actions}>
          <button type="button" className={m.cancelBtn} onClick={onCancel}>
            {t.cancel}
          </button>
          <button
            type="button"
            className={m.saveBtn}
            style={warn ? { background: 'var(--d-warn)' } : undefined}
            onClick={onAccept}
          >
            {request.confirmLabel ?? t.confirmYes}
          </button>
        </div>
      </div>
    </div>
  );
}
