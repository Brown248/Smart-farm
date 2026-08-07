import type { Device } from '@shared/device';
import type { Dict } from '@/i18n/keys';
import { STATUS_COLOR } from './status';
import { deviceName } from './deviceLabel';

/**
 * แปลงสถานะอุปกรณ์เป็นสิ่งที่การ์ดต้องวาด — แยกออกมาเป็นฟังก์ชันบริสุทธิ์
 * เพื่อให้เทสตรวจ "ปุ่มต้อง disable เมื่อไหร่" ได้โดยไม่ต้อง render
 *
 * ลำดับความสำคัญของสถานะ: ออฟไลน์ → หยุดฉุกเฉิน → รอผลคำสั่ง → เปิด/ปิด
 */
export interface DeviceView {
  readonly id: Device['id'];
  readonly name: string;
  readonly statusText: string;
  readonly statusColor: string;
  readonly statusTextColor: string;
  readonly dotAnimation: string | undefined;
  readonly borderColor: string;
  readonly cardBackground: string;
  readonly buttonLabel: string;
  readonly buttonBackground: string;
  readonly buttonColor: string;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly modeLabel: string;
  readonly modeDisabled: boolean;
  readonly rowDelay: string;
}

export interface DeviceViewContext {
  readonly t: Dict;
  readonly estop: boolean;
  readonly justDone: boolean;
  readonly index: number;
  /** โหมดควบคุมจริง — auto/manual ต้องตั้งที่ส่วนเงื่อนไข (setThreshold) ปุ่มโหมดบนแผงจึง disable */
  readonly realControl?: boolean;
  /** อุปกรณ์นี้พ่วงกับตัวอื่น (พัดลมเล็ก↔ใหญ่#2) — คุมแยกไม่ได้ ปุ่มเปิด/ปิด+โหมดต้อง disable */
  readonly bonded?: boolean;
}

export function deviceView(
  d: Device,
  { t, estop, justDone, index, realControl = false, bonded = false }: DeviceViewContext,
): DeviceView {
  const pending = d.pending != null;
  const offline = !d.online;
  const blocked = offline || estop || bonded;

  return {
    id: d.id,
    name: deviceName(d, t),
    statusText: offline
      ? t.stOffline
      : estop
        ? t.stLocked
        : pending
          ? d.pending === 'on'
            ? t.stTurningOn
            : t.stTurningOff
          : d.on
            ? t.stOn
            : t.stOff,
    statusColor: offline
      ? STATUS_COLOR.offline
      : estop
        ? STATUS_COLOR.critical
        : pending
          ? STATUS_COLOR.low
          : d.on
            ? STATUS_COLOR.ok
            : '#b9b3a2',
    statusTextColor: offline
      ? STATUS_COLOR.offline
      : estop
        ? STATUS_COLOR.critical
        : pending
          ? '#9a6a15'
          : d.on
            ? '#28684a'
            : 'var(--ink-3)',
    dotAnimation: pending
      ? 'fsBlink 1s ease-in-out infinite'
      : d.on && !estop
        ? 'fsDotGlow 2.6s ease-in-out infinite'
        : undefined,
    borderColor: offline ? '#ddd8c8' : d.on ? 'rgba(39,113,80,.4)' : '#e0cfa8',
    cardBackground: offline
      ? '#f4f2ec'
      : d.on
        ? 'linear-gradient(180deg,#f2fbf5,#eaf6ee)'
        : 'var(--card-cream-1)',
    buttonLabel: justDone
      ? '✓'
      : offline
        ? t.btnUnavailable
        : pending
          ? t.btnSending
          : d.on
            ? t.btnOff
            : t.btnOn,
    buttonBackground: justDone
      ? '#2f9e5f'
      : blocked
        ? '#e6e2d6'
        : pending
          ? '#d8cfae'
          : d.on
            ? '#c9463c'
            : 'var(--brand-green)',
    buttonColor: justDone ? '#fff' : blocked ? '#8a8272' : pending ? '#5a4d28' : '#fff',
    // กันกดซ้ำระหว่างรอผล และกันสั่งอุปกรณ์ที่ออฟไลน์/ถูกล็อก
    disabled: blocked || pending || justDone,
    pending,
    modeLabel: d.auto ? t.modeAuto : t.modeManual,
    // โหมดจริง: auto/manual มาจากเกณฑ์ในอุปกรณ์ · ตัวพ่วงคุมแยกไม่ได้ → ปุ่มโหมด disable
    modeDisabled: offline || realControl || bonded,
    rowDelay: index * 0.05 + 's',
  };
}
