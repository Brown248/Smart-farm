import { hourBangkok } from '@/lib/format';

export interface Tint {
  readonly bg: string;
  readonly op: number;
}

/**
 * เฉดแสงตามช่วงเวลาที่ทาบบนภาพฉาก — พอร์ตตรงจาก `tint()` ในต้นแบบ
 * เช้ามืดอมชมพู · กลางวันใส · เย็นอมทอง · กลางคืนอมน้ำเงิน
 * ใช้ชั่วโมงเวลาไทย ให้ช่วงเช้า-เย็นตรงกับพระอาทิตย์ขึ้น-ตกจริงและนาฬิกา HUD
 */
export function sceneTint(night: boolean, now: Date): Tint {
  const hm = hourBangkok(now);

  if (night) {
    return {
      bg: 'linear-gradient(180deg, rgba(80,110,200,.5), rgba(80,110,200,0) 60%)',
      op: 0.14,
    };
  }
  if (hm >= 4.5 && hm < 8.5) {
    return {
      bg: 'linear-gradient(180deg, rgba(255,150,120,.55), rgba(255,190,140,.18) 50%, rgba(255,255,255,0) 75%)',
      op: Math.max(0.06, (1 - Math.abs(hm - 6.5) / 2) * 0.5),
    };
  }
  if (hm >= 15.5 && hm < 19.5) {
    return {
      bg: 'linear-gradient(250deg, rgba(255,175,80,.5), rgba(255,200,120,.15) 50%, rgba(255,255,255,0) 78%)',
      op: Math.max(0.06, (1 - Math.abs(hm - 17.5) / 2) * 0.55),
    };
  }
  return {
    bg: 'linear-gradient(180deg, rgba(255,244,210,.25), rgba(255,255,255,0) 55%)',
    op: 0.1,
  };
}
