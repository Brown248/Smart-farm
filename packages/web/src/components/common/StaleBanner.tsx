import { useEffect, useState } from 'react';
import { useLiveSnapshot } from '@/state/liveStatus';
import { useI18n } from '@/i18n/useI18n';
import { Icon } from '@/components/common/Icon';
import s from './StaleBanner.module.css';

/**
 * แถบเตือน "อุปกรณ์ออฟไลน์ · ค่าค้าง" ระดับหน้า — โผล่เมื่อ `deviceStale` (shadow_ts เก่า)
 *
 * ป้าย ConnectionPill บน header บอกสถานะแล้ว แต่ตัวเลขบนการ์ด/ฉากยังดู "สด" อยู่
 * (backend re-send ค่าเก่าซ้ำ ทำให้ `live.fields` ยังมีค่า) — แถบนี้พูดชัดว่า **ทุกค่าที่เห็นเป็นค่าค้าง**
 * ไม่ใช่ของสด · สำคัญกับระบบควบคุม (เห็น 39°C คิดว่าสด แต่จริงอุปกรณ์เงียบไปนานแล้ว)
 *
 * อ่าน store เดียวกับ ConnectionPill · เดินนาฬิกาเองทุก 20 วิ ให้ตัวเลข "นาที" ขยับ
 */
export function StaleBanner() {
  const { t } = useI18n();
  const { deviceStale, deviceLastSeenMs, deviceBanned } = useLiveSnapshot();
  const [, tick] = useState(0);
  const show = deviceBanned || deviceStale;
  useEffect(() => {
    if (!show) return;
    const id = window.setInterval(() => tick((x) => x + 1), 20_000);
    return () => window.clearInterval(id);
  }, [show]);

  if (!show) return null;
  // ถูกระงับ (netpie_banned) สำคัญกว่า "ค่าค้าง" — ผู้ใช้แก้เองไม่ได้ ต้องขึ้นให้ติดต่อผู้ดูแล
  if (deviceBanned) {
    return (
      <div className={s.banner} role="alert">
        <Icon name="alert" size={18} color="var(--d-warn-deep)" strokeWidth={2} />
        <span className={s.text}>{t.bannedBanner}</span>
      </div>
    );
  }
  const mins =
    deviceLastSeenMs !== null
      ? String(Math.max(1, Math.round((Date.now() - deviceLastSeenMs) / 60_000)))
      : '?';
  return (
    <div className={s.banner} role="alert">
      <Icon name="alert" size={18} color="var(--d-warn-deep)" strokeWidth={2} />
      <span className={s.text}>{t.staleBanner(mins)}</span>
    </div>
  );
}
