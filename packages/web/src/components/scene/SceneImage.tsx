import type { Tint } from '@/lib/sceneTint';
import s from './SceneImage.module.css';

export const SCENE_DAY_SRC = '/assets/greenhouse-scene.jpg';
export const SCENE_NIGHT_SRC = '/assets/greenhouse-scene-night.jpg';
export const SCENE_DAY_RAIN_SRC = '/assets/greenhouse-scene-rain.jpg';
export const SCENE_NIGHT_RAIN_SRC = '/assets/greenhouse-scene-rain-night.jpg';

/** ภาพฉากที่ตรงกับสภาพตอนนี้ — ใช้กับฉากหลังเบลอ (backdrop) กับ heat shimmer ให้กลมกลืน */
export function sceneSrc(night: boolean, rain: boolean): string {
  if (night) return rain ? SCENE_NIGHT_RAIN_SRC : SCENE_NIGHT_SRC;
  return rain ? SCENE_DAY_RAIN_SRC : SCENE_DAY_SRC;
}

export interface SceneImageProps {
  readonly night: boolean;
  /** ฝนตกอยู่ไหม (จากพยากรณ์จริง/ผู้ใช้บังคับ) — สลับเป็นภาพฉากฝน */
  readonly rain: boolean;
  readonly tint: Tint;
  readonly alt: string;
  /** ปิด crossfade (สแนปทันที) — ใช้ตอนโหลดครั้งแรกก่อนพยากรณ์มาถึง ไม่ให้เห็นฉากเปลี่ยนตอนรีเฟรช */
  readonly instant?: boolean;
}

/**
 * ภาพฉาก 4 ใบ cross-fade กันใน 2.2 วินาที ตาม (กลางคืน × ฝน):
 *   กลางวันปกติ · กลางวันฝน · กลางคืนปกติ · กลางคืนฝน
 * ภาพกลางคืนซ้อนด้วย `plus-lighter` (ฉากเดียวกันที่หลอดไฟติด → ไฟค่อยๆ สว่าง)
 * เม็ดฝน CSS (RainLayers/ฝนกระทบ/หยดน้ำ/หมอก) ยังซ้อนด้านบนเพื่อเพิ่มการเคลื่อนไหวจริง
 */
export function SceneImage({ night, rain, tint, alt, instant = false }: SceneImageProps) {
  const dayClear = !night && !rain;
  const dayRain = !night && rain;
  const nightClear = night && !rain;
  const nightRain = night && rain;
  const snap = instant ? ` ${s.instant}` : '';

  return (
    <>
      <div className={s.void} aria-hidden="true" />

      {/* กลางวัน — ปกติ (ใบเดียวที่ถือชื่อ accessible ของฉาก) กับ ฝน */}
      <img
        className={`${s.plate} ${s.day}${snap}`}
        src={SCENE_DAY_SRC}
        alt={alt}
        style={{ opacity: dayClear ? 1 : 0 }}
      />
      <img
        className={`${s.plate} ${s.day}${snap}`}
        src={SCENE_DAY_RAIN_SRC}
        alt=""
        aria-hidden="true"
        style={{ opacity: dayRain ? 1 : 0 }}
      />

      {/* กลางคืน — plus-lighter ให้ไฟค่อยๆ ติด */}
      <img
        className={`${s.plate} ${s.night}${snap}`}
        src={SCENE_NIGHT_SRC}
        alt=""
        aria-hidden="true"
        style={{ opacity: nightClear ? 1 : 0 }}
      />
      <img
        className={`${s.plate} ${s.night}${snap}`}
        src={SCENE_NIGHT_RAIN_SRC}
        alt=""
        aria-hidden="true"
        style={{ opacity: nightRain ? 1 : 0 }}
      />

      <div
        className={`${s.tint}${snap}`}
        aria-hidden="true"
        style={{ background: tint.bg, opacity: tint.op }}
      />

      {/* ชั้นเบลอรอบขอบ (โฟกัสกลางภาพ) — เฉพาะกลางวัน · ใช้ภาพที่ตรงกับฝน */}
      <img
        className={`${s.plate} ${s.dof}${snap}`}
        src={rain ? SCENE_DAY_RAIN_SRC : SCENE_DAY_SRC}
        alt=""
        aria-hidden="true"
        style={{ opacity: night ? 0 : 0.42 }}
      />
    </>
  );
}
