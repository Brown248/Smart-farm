import type { Device } from '@shared/device';
import type { Dict } from '@/i18n/keys';

/** ชื่ออุปกรณ์ที่ผู้ใช้เห็น เช่น "พัดลมใบใหญ่ #1" — ปั๊มไม่มีเลขต่อท้าย (n = 0) */
export const deviceName = (d: Device, t: Dict): string => t[d.type] + (d.n ? ' #' + d.n : '');
