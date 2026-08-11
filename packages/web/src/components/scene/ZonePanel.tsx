import type { SceneZone } from '@shared/zone';
import { SOIL } from '@shared/thresholds';
import { Card, Modal } from '@/components/common';
import { ZONE_LABELS } from '@/data/zones';
import { useI18n } from '@/i18n/useI18n';
import { STATUS_COLOR, zoneColor, zoneStatusText } from '@/lib/status';
import { hhmmBangkok } from '@/lib/format';
import s from './ZonePanel.module.css';

export interface ZonePanelProps {
  readonly zone: SceneZone | null;
  readonly now: Date;
  readonly onClose: () => void;
  readonly zoneName: (id: SceneZone['id']) => string;
  readonly reduced: boolean;
}

/** แผ่นรายละเอียดโซน เลื่อนขึ้นจากด้านล่าง */
export function ZonePanel({ zone, now, onClose, zoneName, reduced }: ZonePanelProps) {
  const { t } = useI18n();
  if (!zone) return null;

  const soil = Math.round(zone.soil);

  /*
   * แสดงเฉพาะค่าที่รู้จริง: ความชื้นดิน (จริง/จำลองตามระบบกลาง) · ช่วงเหมาะสม (ค่าอ้างอิง)
   * **โรงเรือนนี้ไม่มีระบบรดน้ำ** (ปั๊มที่มีคือปั๊มคูลลิ่งแพด) จึงไม่มีปุ่มรดน้ำและไม่มีเวลารดน้ำ
   */
  const metrics = [
    {
      label: t.mSoil,
      value: soil + '%',
      color:
        zone.soil < SOIL.critical
          ? STATUS_COLOR.critical
          : zone.soil < SOIL.low
            ? STATUS_COLOR.low
            : 'var(--ink)',
    },
    { label: t.mOptimal, value: `${SOIL.optimalLo}–${SOIL.optimalHi}%`, color: 'var(--ink)' },
  ];

  // ประวัติมีได้แค่จุดเดียวที่เป็นของจริง = สถานะตอนนี้ (เวลาไทย) ไม่กุเหตุการณ์ย้อนหลัง
  const history = [{ t: hhmmBangkok(now), text: t.histNow(soil, zoneStatusText(zone.status, t)) }];

  return (
    <Modal open variant="sheet" closeLabel={t.close} onClose={onClose} zIndex={74}>
      <div className={s.head}>
        <span className={s.headDot} style={{ background: zoneColor(zone.status) }} />
        <div className={s.headText}>
          <strong className={s.name}>{zoneName(zone.id)}</strong>
          <span className={s.crop}>
            {t[ZONE_LABELS[zone.id].crop]} · {zoneStatusText(zone.status, t)}
          </span>
        </div>
        <div className={s.spacer} />
        <button type="button" className={s.close} aria-label={t.close} onClick={onClose}>
          ✕
        </button>
      </div>

      <div className={s.metrics}>
        {metrics.map((m, i) => (
          <Card
            key={m.label}
            variant="metric"
            style={
              reduced ? undefined : { animation: `fsRowIn .4s ease-out ${i * 0.05}s backwards` }
            }
          >
            <span className={s.metricLabel}>{m.label}</span>
            <strong className={s.metricValue} style={{ color: m.color }}>
              {m.value}
            </strong>
          </Card>
        ))}
      </div>

      <div className={s.history}>
        <span className={s.historyTitle}>{t.historyTitle}</span>
        {history.map((h) => (
          <div key={h.t + h.text} className={s.historyRow}>
            <span className={s.historyTime}>{h.t}</span>
            <span>{h.text}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
