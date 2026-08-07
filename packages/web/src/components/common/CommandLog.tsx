import { CMD_SOURCE_META } from '@/data/devices';
import type { LogEntry } from '@/data/devices';
import { useI18n } from '@/i18n/useI18n';
import s from './CommandLog.module.css';

export interface CommandLogProps {
  readonly entries: readonly LogEntry[];
  /** แสดงกี่รายการ — ที่เก็บมี 30 แต่บนจอโชว์แค่ไม่กี่บรรทัด */
  readonly limit?: number | undefined;
}

/**
 * ประวัติการสั่งงาน — **อ่านจาก control log ส่วนกลางที่เดียว**
 *
 * เดิมหน้าโรงเรือนเก็บ `cmdLog` ของตัวเอง ส่วนลิ้นชักหน้าชลประทานอ่าน `command.log`
 * สั่งงานที่หน้าหนึ่งแล้วอีกหน้าไม่เห็น ทั้งที่หัวข้อใช้คีย์ `ctrlLogTitle` เดียวกัน
 */
export function CommandLog({ entries, limit = 6 }: CommandLogProps) {
  const { t } = useI18n();

  return (
    <div className={s.list}>
      {entries.slice(0, limit).map((l, i) => {
        const meta = CMD_SOURCE_META[l.src];
        const action = l.text ?? (l.key ? (t[l.key] as string) : '');
        return (
          <div key={`${l.t}-${action}-${i}`} className={s.row}>
            <span className={s.dot} aria-hidden="true" style={{ background: meta.color }} />
            <div className={s.body}>
              <div className={s.top}>
                <b className={s.action}>{action}</b>
                <span className={s.tag} style={{ color: meta.color, background: meta.bg }}>
                  {t[meta.labelKey]}
                </span>
              </div>
              <div className={s.meta}>
                {l.t} · {t[meta.byKey]}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
