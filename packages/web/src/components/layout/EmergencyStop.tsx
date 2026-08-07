import { CommandConfirm } from '@/components/common/CommandConfirm';
import { Icon } from '@/components/common/Icon';
import { useConfirm } from '@/hooks/useConfirm';
import { useEstop } from '@/hooks/useEstop';
import { useI18n } from '@/i18n/useI18n';
import s from './EmergencyStop.module.css';

export interface EmergencyStopProps {
  /** แถบเมนูยุบอยู่ไหม — ยุบแล้วเหลือไอคอน แต่ชื่อที่ screen reader อ่านเหมือนเดิม */
  readonly collapsed: boolean;
  readonly onFlash: (message: string) => void;
}

/**
 * หยุดฉุกเฉิน — **ปุ่มเดียวของหน้าจอข้อมูลทั้งหมด** อยู่ในแถบเมนู
 *
 * เดิมมีปุ่มนี้แยกกันอยู่ในตัวหน้าชลประทานและหน้าโรงเรือน คนละ handler
 * (หน้าโรงเรือนปลดล็อกได้ในกดเดียวโดยไม่ถามยืนยัน) และทั้งคู่ต้องเลื่อนหน้าลงไปหา
 * ย้ายมาที่นี่เพราะแถบเมนู sticky — ตอนฉุกเฉินไม่มีใครมานั่งเลื่อนหาปุ่ม
 *
 * ฉากเกมยังใช้ FAB ของตัวเองอยู่ (คนละหน้าตา) แต่เรียก `useEstop` ตัวเดียวกันนี้
 */
export function EmergencyStop({ collapsed, onFlash }: EmergencyStopProps) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const { estop, estopPress } = useEstop({ t, confirm, flash: onFlash });

  const label = estop ? t.unlockFab : t.estopFab;

  return (
    <>
      <button
        type="button"
        aria-pressed={estop}
        aria-label={label}
        title={label}
        className={[s.estop, estop ? s.active : null, collapsed ? s.compact : null]
          .filter(Boolean)
          .join(' ')}
        onClick={estopPress}
      >
        <span className={s.icon} aria-hidden="true">
          <Icon name="stop" size={19} strokeWidth={2.2} />
        </span>
        <span className={s.label}>{label}</span>
      </button>

      <CommandConfirm
        request={confirm.request}
        onCancel={confirm.cancel}
        onAccept={confirm.accept}
      />
    </>
  );
}
