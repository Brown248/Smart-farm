import { Icon } from '@/components/common/Icon';
import { useI18n } from '@/i18n/useI18n';
import s from './dashboard.module.css';

export interface CriticalBannerProps {
  readonly show: boolean;
  readonly onDetails: () => void;
  readonly onDismiss: () => void;
  /**
   * ข้อความเตือน — ไม่ส่ง = ใช้ข้อความ mock เดิม (`bannerTitle`/`bannerSub`)
   * ส่งมาเมื่อต่อจริงและมีปัญหาจากค่าจริง เพื่อให้แบนเนอร์บอกปัญหาจริง ไม่ใช่ข้อความฝังไว้
   */
  readonly title?: string | undefined;
  readonly sub?: string | undefined;
}

/** แถบเตือนเรื่องที่ต้องรู้ทันที — ปิดได้ และหายเองเมื่อกดรับทราบในหน้าต่างสุขภาพเซนเซอร์ */
export function CriticalBanner({ show, onDetails, onDismiss, title, sub }: CriticalBannerProps) {
  const { t } = useI18n();
  if (!show) return null;

  return (
    <div className={s.banner} role="alert">
      <span className={s.bannerIcon} aria-hidden="true">
        <Icon name="alert" size={22} color="#9a5e0c" strokeWidth={1.8} />
      </span>
      <div className={s.bannerBody}>
        <div className={s.bannerTitle}>{title ?? t.bannerTitle}</div>
        <div className={s.bannerSub}>{sub ?? t.bannerSub}</div>
      </div>
      <button type="button" className={s.bannerCta} onClick={onDetails}>
        {t.details}
      </button>
      <button
        type="button"
        className={s.bannerClose}
        aria-label={t.close}
        title={t.close}
        onClick={onDismiss}
      >
        <Icon name="close" size={15} strokeWidth={2.2} />
      </button>
    </div>
  );
}
