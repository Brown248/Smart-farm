import type { ClimateValues } from '@shared/sensor';
import type { SceneZone } from '@shared/zone';
import { useFarmState } from '@/state/FarmStateProvider';

export interface FarmSim {
  readonly climate: ClimateValues;
  readonly zones: readonly SceneZone[];
  /** ปั๊มกำลังจ่ายน้ำอยู่ไหม — เป็นของทั้งโรงเรือน ไม่มีรายโซน */
  readonly watering: boolean;
}

/**
 * ข้อมูลจำลองของโรงเรือน
 *
 * ตัวเดินค่าจริงย้ายไปอยู่ใน `state/FarmStateProvider` แล้ว เพราะทุกหน้าต้องเห็นค่าเดียวกัน
 * (เดิมมีแต่ฉากเกมที่เดินค่า ส่วนแดชบอร์ด/โรงเรือนใช้ตัวเลขคงที่คนละชุด)
 * hook นี้คงหน้าตาเดิมไว้ให้ฉากเกมเรียกใช้ — เมื่อต่อ ThingsBoard จริงในเฟส 5
 * ให้เปลี่ยนที่ provider ที่เดียว
 */
export function useFarmSim(): FarmSim {
  const { climate, zones, watering } = useFarmState();
  return { climate, zones, watering };
}
