import { Icon } from '@/components/common/Icon';
import { useFarmState } from '@/state/FarmStateProvider';
import { useI18n } from '@/i18n/useI18n';
import type { Dict } from '@/i18n/keys';
import s from './CommandChannel.module.css';

/** เวลาที่ device ตอบกลับ → ข้อความ "เมื่อ …" (คำนวณตอน render พอ ไม่ต้องเดินนาฬิกา) */
function ago(at: number, t: Dict): string {
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1) return t.cmdChJustNow;
  if (mins < 60) return t.cmdChMinAgo(mins);
  return t.cmdChHrAgo(Math.floor(mins / 60));
}

/**
 * ป้ายบอกผลตอบกลับคำสั่งล่าสุดจากอุปกรณ์ (`cmd_result`)
 *
 * ปิดช่องว่าง "ส่งคำสั่งแล้ว" vs "อุปกรณ์ทำจริงไหม" — `cmd_result` คือสิ่งที่ device
 * ตอบกลับหลังรับคำสั่ง (สำเร็จ/ล้มเหลว) จึงเป็นสัญญาณว่าช่องสั่งงานยังตอบสนองอยู่
 *
 * โผล่เฉพาะตอนต่อจริงและมีผลตอบกลับแล้ว — ยังไม่ล็อกอิน/ยังไม่มีคำสั่งก็ไม่ต้องแสดง
 * (เป็นผลของคำสั่งจาก controller ใดๆ ไม่ใช่แค่ปุ่มบนเว็บนี้ จึงเขียนว่า "อุปกรณ์" กว้างๆ)
 */
export function CommandChannel() {
  const { t } = useI18n();
  const { live } = useFarmState();
  const cmd = live.command;

  if (live.status !== 'live' || cmd === null) return null;

  const label = cmd.ok ? t.cmdChOk : t.cmdChFail;
  const detail = [cmd.ok ? null : cmd.error, ago(cmd.at, t)].filter(Boolean).join(' · ');

  return (
    <span
      className={[s.chip, cmd.ok ? s.ok : s.fail].join(' ')}
      title={`${t.cmdChTitle} — ${label}`}
    >
      <Icon name={cmd.ok ? 'check' : 'alert'} size={13} strokeWidth={2.2} />
      <span className={s.text}>
        <b>{label}</b>
        {detail !== '' ? <span className={s.detail}>{detail}</span> : null}
      </span>
    </span>
  );
}
