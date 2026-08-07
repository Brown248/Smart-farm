import { deviceRunning } from '@shared/device';
import type { Device, DeviceId } from '@shared/device';
import { BIG_FAN_LOCK_TEMP } from '@shared/thresholds';
import type { Dict } from '@/i18n/keys';

export interface GuardContext {
  readonly devices: readonly Device[];
  /**
   * ระดับน้ำในถัง — ยังรับไว้เพื่อให้ผู้เรียกส่งบริบทเดิมได้ แต่ **ไม่ใช้ในกฎแล้ว**
   * guard G1 (ปั๊มเปิดได้เมื่อถัง > 20%) ถูกถอดออก เพราะถังเป็นค่า mock ไม่มีเซนเซอร์จริง
   * แทนที่ด้วย: ข้อความยืนยันเช็คน้ำก่อนเปิดปั๊ม + auto-cutoff (ดู useDeviceCommand)
   */
  readonly tank: number;
  readonly temp: number;
  readonly t: Dict;
}

/**
 * กฎกันคำสั่งอันตราย — คืนข้อความเหตุผลถ้าถูกบล็อก, คืน null ถ้าสั่งได้
 *
 * G2 · ห้ามปิดพัดลมใบใหญ่ตัวสุดท้ายขณะอุณหภูมิ > 33°C
 * (G1 ปั๊ม-ถังน้ำถูกถอดออก — ถังเป็น mock กันไม่ได้จริง · ใช้ยืนยัน+cutoff แทน)
 */
export function guard(
  id: DeviceId,
  target: boolean,
  { devices, temp, t }: GuardContext,
): string | null {
  if (isBigFan(id) && !target) {
    const otherId: DeviceId = id === 'big1' ? 'big2' : 'big1';
    const other = devices.find((d) => d.id === otherId);
    // ใช้ pending ถ้ามี เพื่อไม่ให้ปิดสองตัวรัวๆ ก่อนคำสั่งแรกจะ settle
    const otherRunning = other ? deviceRunning(other) : false;
    const blocked = bigFanOffBlocked(temp, otherRunning);
    if (blocked) return t.guardBigFan(temp.toFixed(1));
  }

  return null;
}

/** `big1` / `big2` — พัดลมใบใหญ่ที่เป็นตัวระบายความร้อนหลัก */
export const isBigFan = (id: DeviceId): boolean => id.startsWith('big');

/**
 * G2 แยกออกมาเป็นฟังก์ชันเดี่ยว เพราะหน้าควบคุมโรงเรือนคุมพัดลมชุดเดียวกันนี้
 * แต่เก็บสถานะคนละแบบ (ไม่ใช่ `Device[]`) — ต้องใช้กฎเดียวกันทั้งสองหน้า
 * ไม่งั้นอุปกรณ์ตัวเดียวกันจะมีนโยบายความปลอดภัยสองแบบขึ้นกับว่าเปิดหน้าไหนอยู่
 */
export const bigFanOffBlocked = (temp: number, otherBigFanRunning: boolean): boolean =>
  temp > BIG_FAN_LOCK_TEMP && !otherBigFanRunning;
