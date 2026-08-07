/**
 * ตัวสุ่มแบบ deterministic — ผลลัพธ์เหมือนเดิมทุกครั้งที่โหลด
 * ทำให้ฝุ่น/หิ่งห้อย/หยดน้ำ อยู่ตำแหน่งเดิมเสมอ ไม่กระพริบตอน re-render
 * (พอร์ตตรงจาก `seeded` / `makeParticles` ในต้นแบบ)
 */
const seeded = (i: number, salt: number): number => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** สุ่มค่าในช่วง [a, b) โดยใช้ salt ย่อย `s` เพื่อให้แต่ละ property ต่างกัน */
export type Rand = (a: number, b: number, s: number) => number;

export function makeParticles<T>(n: number, salt: number, fn: (i: number, r: Rand) => T): T[] {
  return Array.from({ length: n }, (_, i) => fn(i, (a, b, s) => a + seeded(i, salt + s) * (b - a)));
}

export interface Mote {
  readonly left: string;
  readonly top: string;
  readonly size: string;
  readonly dur: string;
  readonly delay: string;
}

/** ฝุ่นลอยในลำแสงกลางวัน — 10 เม็ด */
export const MOTES: readonly Mote[] = makeParticles(10, 1, (_i, r) => ({
  left: r(8, 86, 1).toFixed(1) + '%',
  top: r(16, 68, 2).toFixed(1) + '%',
  size: r(2.6, 4.6, 3).toFixed(1) + 'px',
  dur: r(7, 13, 4).toFixed(1) + 's',
  delay: r(0, 7, 5).toFixed(1) + 's',
}));

/** หิ่งห้อยตอนกลางคืน — 6 ตัว */
export const FIREFLIES: readonly Mote[] = makeParticles(6, 9, (_i, r) => ({
  left: r(14, 82, 1).toFixed(1) + '%',
  top: r(30, 74, 2).toFixed(1) + '%',
  size: r(5, 7, 3).toFixed(0) + 'px',
  dur: r(5, 9, 4).toFixed(1) + 's',
  delay: r(0, 4, 5).toFixed(1) + 's',
}));

export interface Drip {
  readonly left: string;
  readonly dur: string;
  readonly delay: string;
  /** ความยาวหางน้ำ */
  readonly len: string;
  /** ความหนาของสาย */
  readonly w: string;
  /** ระยะส่ายซ้าย-ขวาตอนไหล — น้ำบนกระจกจริงไม่ไหลตรงดิ่ง */
  readonly drift: string;
  /** ระยะที่ไหลลงทั้งหมด */
  readonly fall: string;
}

/**
 * หยดน้ำไหลบนกระจกหลังคาตอนฝนตก — 10 สาย
 * ขนาด/ความเร็ว/การส่ายต่างกันทุกสาย จะได้ไม่ดูเป็นแท่งซ้ำๆ
 * **fall สั้น (12-24vh)** ให้อยู่ในแถบกระจกหลังคาด้านบน ไม่ไหลลงมาทับแปลงผัก (ดูเหมือนตกในโรงเรือน)
 */
export const DRIPS: readonly Drip[] = makeParticles(10, 17, (_i, r) => {
  // บวก 3px กันไม่ให้สายที่สุ่มได้ใกล้ 0 ไหลตรงดิ่งจนดูแข็ง
  const sway = r(-9, 9, 6);
  return {
    left: r(6, 90, 1).toFixed(1) + '%',
    dur: r(4.5, 9, 2).toFixed(1) + 's',
    delay: r(0, 6, 3).toFixed(1) + 's',
    len: r(24, 48, 4).toFixed(0) + 'px',
    w: r(1.6, 3.2, 5).toFixed(1) + 'px',
    drift: (sway < 0 ? sway - 3 : sway + 3).toFixed(1) + 'px',
    fall: r(12, 24, 7).toFixed(0) + 'vh',
  };
});

export interface Impact {
  readonly left: string;
  readonly top: string;
  readonly size: string;
  readonly dur: string;
  readonly delay: string;
  readonly peak: string;
}

/**
 * เม็ดฝนกระทบหลังคากระจก — วงกระเพื่อมเล็กๆ 18 จุด
 * อยู่ในแถบบน 6–40% ซึ่งเป็นช่วงกระจกในภาพ (แถบเดียวกับที่ mask ฝนไว้)
 */
export const IMPACTS: readonly Impact[] = makeParticles(18, 31, (_i, r) => ({
  left: r(4, 95, 1).toFixed(1) + '%',
  top: r(6, 40, 2).toFixed(1) + '%',
  size: r(9, 26, 3).toFixed(0) + 'px',
  dur: r(0.9, 1.8, 4).toFixed(2) + 's',
  delay: r(0, 4.5, 5).toFixed(2) + 's',
  peak: r(0.28, 0.62, 6).toFixed(2),
}));
