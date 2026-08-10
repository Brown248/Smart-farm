import { useFarmAlerts } from '@/hooks/useFarmAlerts';
import { useI18n } from '@/i18n/useI18n';
import d from './dashboard.module.css';
import m from './modals.module.css';

export interface NotifPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function NotifPanel({ open, onClose }: NotifPanelProps) {
  const { t } = useI18n();
  /*
   * แจ้งเตือนอิงค่าจริงเมื่อ live · **สลับเป็นข้อความจำลองเมื่อหลุด/ยังไม่ล็อกอิน** (ดู useFarmAlerts)
   *
   * ต้องหยิบ `isLive` มาติดป้ายด้วย ไม่งั้นตอนเน็ตหลุดผู้ใช้จะเปิดแผงนี้มาอ่านข้อความปลอม
   * โดยไม่รู้ตัว — ซึ่งเป็นแผงที่คนกดดูตอน "สงสัยว่ามีปัญหาอะไร" พอดี
   */
  const { items, isLive } = useFarmAlerts();
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
        {/* ป้ายเดียวกับที่การ์ดเซนเซอร์ใช้ — ภาษาเดียวกันทั้งแอป ไม่ต้องเรียนรู้สัญลักษณ์ใหม่ */}
        {!isLive ? (
          <span className={`${d.senSrc} ${d.senSrcSim}`} title={t.simTagHint}>
            {t.simTag}
          </span>
        ) : null}
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
