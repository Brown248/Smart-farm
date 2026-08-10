import type { TextKey } from '@/i18n/keys';

/**
 * เส้นทางและรายการเมนู — แยกออกจาก `routes.tsx` โดยตั้งใจ
 * เพราะ `routes.tsx` import หน้าเพจ ส่วนหน้าเพจก็ต้องรู้จักเส้นทาง
 * ถ้าอยู่ไฟล์เดียวกันจะเกิด import วน แล้วค่าคงที่กลายเป็น undefined ตอนโหลด
 *
 * ฉากฟาร์มเกมเป็นหน้าแรก หน้าข้อมูลอยู่ใต้ path ของตัวเอง
 * หน้าที่ยังไม่ได้ทำ (รายงาน · ตั้งค่า) ไม่มีเส้นทาง — กดแล้วขึ้น toast แทน
 */
export const ROUTES = {
  farm: '/',
  dashboard: '/dashboard',
  irrigation: '/irrigation',
  greenhouse: '/greenhouse',
} as const;

export interface NavItem {
  readonly key: TextKey;
  readonly to: string | null;
  /** ยังไม่ได้ทำ — กดแล้วขึ้น toast "เร็วๆ นี้" แทนการพาไปหน้าเปล่า */
  readonly soon: boolean;
}

/**
 * เมนูของเมนูสไลด์ในฉากเกม — **ต้องเป็นชุดเดียวกับ `AppRail` ของหน้าข้อมูล**
 * ไม่งั้นเมนูสองที่ในแอปเดียวกันจะไม่ตรงกัน ซึ่งผู้ใช้จับได้ทันที
 *
 * ตัด "รายงาน/ประวัติ" กับ "ตั้งค่า" ออกแล้ว (เจ้าของงานสั่ง 2026-08-10)
 * — ไม่มีต้นแบบและไม่มีแผนจะทำ · ของที่ควรอยู่ในนั้นมีอยู่แล้วในหน้าอื่น
 * `soon` คงไว้ในโครงสร้างเผื่อวันหน้ามีหน้าใหม่ที่ยังทำไม่เสร็จจริงๆ
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'navDashboard', to: ROUTES.dashboard, soon: false },
  { key: 'navIrrigation', to: ROUTES.irrigation, soon: false },
  { key: 'navGreenhouse', to: ROUTES.greenhouse, soon: false },
  { key: 'navFarmGame', to: ROUTES.farm, soon: false },
];
