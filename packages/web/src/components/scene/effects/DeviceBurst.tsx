import { useEffect, useRef, useState } from 'react';
import { deviceRunning } from '@shared/device';
import type { Device } from '@shared/device';
import { FAN_POSITIONS, PUMP_SHIMMER } from '@/data/bulbs';
import s from './effects.module.css';

export interface DeviceBurstProps {
  readonly devices: readonly Device[];
  /** ผู้ใช้ขอลดการเคลื่อนไหว → ไม่สร้างเลเยอร์นี้เลย */
  readonly reduced: boolean;
}

/** [x%, y%, กว้าง%] ของแต่ละอุปกรณ์ — ปั๊มไม่ได้อยู่ใน FAN_POSITIONS จึงต่อท้ายเอง */
function burstSpot(id: string): readonly [number, number, number] | null {
  const fan = FAN_POSITIONS[id as keyof typeof FAN_POSITIONS];
  if (fan) return fan;
  if (id === 'pump') return [PUMP_SHIMMER.left, PUMP_SHIMMER.top, PUMP_SHIMMER.width];
  return null;
}

/**
 * วงกระเพื่อมตรงตัวอุปกรณ์ **ตอนที่มันเพิ่งเริ่มทำงาน** — กดปุ่มแล้วโลกในฉากตอบกลับ
 *
 * ต่างจาก `DeviceEffects` ที่วาดสิ่งที่เกิด "ขณะ" อุปกรณ์ทำงาน (แสงพัดลม · ละอองปั๊ม)
 * ตัวนี้จับ **จังหวะเปลี่ยน** อย่างเดียว เล่นรอบเดียวแล้วจาง ไม่วนซ้ำ
 * จึงเห็นได้ชัดแม้พัดลมจะหมุนอยู่แล้วอีกตัวหนึ่ง
 *
 * ไม่ใช้ `setTimeout` ถอดออกจาก DOM — ให้ keyframe จบที่ opacity 0 แล้วปล่อยค้างไว้
 * (ไม่มี timer = ไม่มีอะไรต้องเคลียร์ตอน unmount · กับดักข้อ 8)
 * เล่นซ้ำด้วยการเปลี่ยน `key` ตามรอบที่นับได้ → React ถอดของเก่าสร้างใหม่ animation เริ่มใหม่
 */
export function DeviceBurst({ devices, reduced }: DeviceBurstProps) {
  /*
   * สถานะรอบก่อนหน้า — เริ่มเป็น `{}` โดยตั้งใจ เพื่อให้ตอนเปิดหน้ามาแล้วพัดลมหมุนอยู่แล้ว
   * **ไม่** เด้ง burst ทันที (นั่นไม่ใช่จังหวะที่ผู้ใช้ทำให้เกิด)
   */
  const wasRunning = useRef<Record<string, boolean>>({});
  const [rounds, setRounds] = useState<Record<string, number>>({});

  useEffect(() => {
    const started: string[] = [];
    for (const d of devices) {
      const running = deviceRunning(d);
      if (running && wasRunning.current[d.id] === false) started.push(d.id);
      wasRunning.current[d.id] = running;
    }
    if (started.length === 0) return;
    // updater บริสุทธิ์ ไม่มี side effect ข้างใน (กับดักข้อ 9 — StrictMode เรียกสองครั้ง)
    setRounds((cur) => {
      const next = { ...cur };
      for (const id of started) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
  }, [devices]);

  if (reduced) return null;

  return (
    <>
      {Object.entries(rounds).map(([id, round]) => {
        const spot = burstSpot(id);
        if (!spot) return null;
        return (
          <span
            key={`burst-${id}-${round}`}
            aria-hidden="true"
            data-effect="burst"
            className={s.burst}
            style={{ left: spot[0] + '%', top: spot[1] + '%', width: spot[2] * 1.6 + '%' }}
          />
        );
      })}
    </>
  );
}
