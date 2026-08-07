import type { IconName } from '@/components/common/Icon';
import type { TextKey } from '@/i18n/keys';

/**
 * แปลงรหัสอากาศ WMO (จาก Open-Meteo) → ไอคอน · ป้ายชื่อ · ฝนตกไหม
 *
 * ตารางรหัส WMO: https://open-meteo.com/en/docs (weather_code)
 *   0 = แจ่มใส · 1–3 = มีเมฆ · 45/48 = หมอก · 51–67 = ฝนปรอย-ฝน ·
 *   71–86 = หิมะ/ฝนปนหิมะ · 80–82 = ฝนซู่ · 95–99 = พายุฝนฟ้าคะนอง
 *
 * เมืองไทยแทบไม่มีหิมะ แต่แมปไว้กันพลาด (ให้เป็นเมฆ)
 */
export type WeatherKind = 'clear' | 'cloud' | 'fog' | 'rain' | 'storm';

export interface WeatherLook {
  readonly kind: WeatherKind;
  readonly icon: IconName;
  readonly labelKey: TextKey;
}

const LOOK: Readonly<Record<WeatherKind, WeatherLook>> = {
  clear: { kind: 'clear', icon: 'wxSun', labelKey: 'wxClear' },
  cloud: { kind: 'cloud', icon: 'wxCloud', labelKey: 'wxCloudy' },
  fog: { kind: 'fog', icon: 'wxCloud', labelKey: 'wxFog' },
  rain: { kind: 'rain', icon: 'wxRain', labelKey: 'wxRainy' },
  storm: { kind: 'storm', icon: 'wxRain', labelKey: 'wxStorm' },
};

function kindOf(code: number): WeatherKind {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 95) return 'storm';
  // 51–86 (ฝนปรอย · ฝน · หิมะ · ฝนซู่) + 80–82 = ฝน
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 71 && code <= 86) return 'cloud'; // หิมะ — เมืองไทยไม่มี ให้เป็นเมฆกันพลาด
  return 'cloud';
}

/** รหัสอากาศ → หน้าตาที่หน้าจอใช้ */
export function weatherLook(code: number): WeatherLook {
  return LOOK[kindOf(code)];
}

/**
 * ฝนตกอยู่ไหม — ใช้ตัดสินว่าฉากเกมควรมีฝน
 * รวมสองสัญญาณ: รหัสอากาศเป็นกลุ่มฝน/พายุ **หรือ** วัดปริมาณฝนได้จริง (mm)
 */
export function isRainingNow(code: number, precipitationMm: number): boolean {
  const k = kindOf(code);
  return k === 'rain' || k === 'storm' || precipitationMm > 0;
}
