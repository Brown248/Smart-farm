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
 * เมนู 6 รายการเหมือนต้นแบบเป๊ะ
 * เหลือ "รายงาน" กับ "ตั้งค่า" ที่ยัง `soon` — สองหน้านี้ไม่มีไฟล์ต้นแบบให้ถอด
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'navDashboard', to: ROUTES.dashboard, soon: false },
  { key: 'navIrrigation', to: ROUTES.irrigation, soon: false },
  { key: 'navGreenhouse', to: ROUTES.greenhouse, soon: false },
  { key: 'navFarmGame', to: ROUTES.farm, soon: false },
  { key: 'navReports', to: null, soon: true },
  { key: 'navSettings', to: null, soon: true },
];
