import type { Point } from '@shared/zone';
import type { DeviceId } from '@shared/device';

/** หลอดไฟ 7 ดวง (% ของภาพฉาก) — ตรงกับตำแหน่งหลอดในภาพ art */
export const BULBS: readonly Point[] = [
  [20.5, 29],
  [31, 21.5],
  [38, 15],
  [50, 17.5],
  [62, 14.5],
  [69.5, 20.5],
  [79.5, 26.5],
];

/** จุดไอน้ำขึ้นเมื่อความชื้นสูง */
export const STEAM: readonly Point[] = [
  [32, 36],
  [53, 50],
  [74, 66],
];

/**
 * ตำแหน่งพัดลมบนภาพฉาก [x%, y%, ขนาด%] — คาลิเบรตแล้วเช่นกัน
 * ปั๊มไม่มีรายการนี้ เพราะวาดเป็นละอองน้ำที่ท่อแทน (ดู PUMP_SHIMMER / PIPE_DOTS)
 */
export const FAN_POSITIONS: Readonly<Partial<Record<DeviceId, readonly [number, number, number]>>> =
  {
    big1: [88, 48.5, 7.5],
    big2: [88.5, 61, 7.5],
    // พัดลมเล็กเหลือตัวเดียว (เจ้าของงานอนุมัติ) — คงตำแหน่ง sml1 ที่คาลิเบรตไว้
    sml1: [82, 30, 4.8],
  };

/** ละอองน้ำที่หัวปั๊ม — [x%, y%, กว้าง%] */
export const PUMP_SHIMMER = { left: 11.5, top: 72, width: 6 } as const;

/** เม็ดน้ำไหลในท่อขณะปั๊มทำงาน */
export const PIPE_DOTS: readonly { left: string; top: string; dur: string; delay: string }[] = [
  { left: '11%', top: '70%', dur: '1.6s', delay: '0s' },
  { left: '12.6%', top: '74%', dur: '1.6s', delay: '.8s' },
];
