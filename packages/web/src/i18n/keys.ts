import type { TH } from './th';

/** key ทั้งหมดมาจาก th.ts → en.ts ต้องมีครบทุก key ไม่งั้น compile ไม่ผ่าน */
export type I18nKey = keyof typeof TH;

/**
 * สเปกข้อ 5 เขียน `Record<I18nKey, string>` ไว้ แต่ต้นแบบมี 21 คีย์ที่เป็นฟังก์ชัน
 * (เช่น `summary`, `aCrit`) การใช้ `string` จะ compile ไม่ผ่าน
 * mapped type นี้ให้ผลเข้มกว่าเดิม: บังคับทั้ง "ครบทุกคีย์" และ "signature ตรงกัน"
 */
export type Dict = { readonly [K in I18nKey]: (typeof TH)[K] };

/**
 * เฉพาะคีย์ที่ค่าเป็นข้อความล้วน (ตัด 21 คีย์ที่เป็นฟังก์ชันจัดรูปแบบออก)
 * ใช้เวลาต้องเก็บ "ชื่อคีย์" ไว้ในตารางแล้วค่อยเปิดดูค่าทีหลัง
 */
export type TextKey = { [K in I18nKey]: (typeof TH)[K] extends string ? K : never }[I18nKey];

export const LANGS = ['th', 'en'] as const;
export type Lang = (typeof LANGS)[number];
