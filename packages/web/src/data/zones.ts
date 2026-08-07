import type { Box, Point, ZoneId } from '@shared/zone';
import type { TextKey } from '@/i18n/keys';

/** ค่าเหล่านี้วัดเทียบกับ greenhouse-scene.jpg แล้วว่าทุกจุดอยู่กลางแปลง
 *  ถ้าเปลี่ยนภาพฉาก ต้องคาลิเบรตใหม่ทั้งหมด
 *
 *  box = พื้นที่กดเลือก [left, top, w, h] · dot = ตำแหน่งหมุด [x, y] (หน่วย % ของภาพ)
 *  ทุกหมุดวางอยู่บนขอบไม้ด้านหน้าของแปลงตัวเอง ไม่มีตัวไหนอยู่บนทางเดิน
 */
export const ZONE_GEOMETRY: Readonly<Record<ZoneId, { box: Box; dot: Point }>> = {
  kale: { box: [24, 33, 16, 15], dot: [32, 41] },
  flower: { box: [42, 33, 16, 15], dot: [50, 40] },
  rosemary: { box: [60, 33, 17, 15], dot: [67.5, 40] },
  mushroom: { box: [11, 49, 15, 21], dot: [19, 59] },
  lettuce: { box: [36, 49, 34, 14], dot: [53, 56] },
  cucumber: { box: [24, 61, 17, 29], dot: [33, 76] },
  strawberry: { box: [46, 62, 16, 28], dot: [54, 77] },
  tomato: { box: [65, 59, 21, 30], dot: [75, 73] },
};

/** คีย์แปลชื่อโซนและชนิดพืช — ตรงกับคีย์ตระกูล zXxx (ชื่อโซน) และ cXxx (ชนิดพืช) ใน DICT */
export const ZONE_LABELS: Readonly<Record<ZoneId, { name: TextKey; crop: TextKey }>> = {
  kale: { name: 'zKale', crop: 'cKale' },
  flower: { name: 'zFlower', crop: 'cFlower' },
  rosemary: { name: 'zRosemary', crop: 'cRosemary' },
  mushroom: { name: 'zMushroom', crop: 'cMushroom' },
  lettuce: { name: 'zLettuce', crop: 'cLettuce' },
  cucumber: { name: 'zCucumber', crop: 'cCucumber' },
  strawberry: { name: 'zStrawberry', crop: 'cStrawberry' },
  tomato: { name: 'zTomato', crop: 'cTomato' },
};
