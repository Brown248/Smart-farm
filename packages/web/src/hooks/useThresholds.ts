import { useCallback, useState } from 'react';
import type { SensorKey, Threshold } from '@/data/dashboard';
import { useFarmState } from '@/state/FarmStateProvider';

export interface ThresholdsApi {
  readonly thresholds: Readonly<Record<SensorKey, Threshold>>;
  /** เซนเซอร์ที่กำลังเปิดหน้าต่างตั้งเกณฑ์อยู่ (null = ปิด) */
  readonly editing: SensorKey | null;
  readonly open: (key: SensorKey) => void;
  /** ปิดโดยไม่บันทึก — ต้องแยกคำสั่งจากปุ่มบันทึก (กฎเหล็กข้อ 4) */
  readonly close: () => void;
  /** บันทึกค่าแล้วปิด — ค่าที่บันทึกมีผลจริงกับการ์ดเซนเซอร์ */
  readonly save: (key: SensorKey, next: Threshold) => void;
  readonly current: Threshold;
}

/**
 * เกณฑ์แจ้งเตือนของเซนเซอร์แต่ละตัว เก็บใน React state ล้วน (กฎเหล็กข้อ 7)
 *
 * ตัวค่าอยู่ที่ `FarmStateProvider` เพราะเป็นเกณฑ์ของฟาร์มเดียวกัน — ตั้งที่แดชบอร์ดแล้ว
 * หน้าอื่นต้องใช้ตามด้วย (เดิมแดชบอร์ดเก็บไว้คนเดียว หน้าอื่นไม่รู้เรื่อง)
 * ส่วน `editing` เป็นสถานะของหน้าต่างที่เปิดอยู่ จึงเก็บไว้ในหน้านั้นได้
 */
export function useThresholds(): ThresholdsApi {
  const { thresholds, setThreshold } = useFarmState();
  const [editing, setEditing] = useState<SensorKey | null>(null);

  const open = useCallback((key: SensorKey) => setEditing(key), []);
  const close = useCallback(() => setEditing(null), []);
  const save = useCallback(
    (key: SensorKey, next: Threshold) => {
      setThreshold(key, next);
      setEditing(null);
    },
    [setThreshold],
  );

  return {
    thresholds,
    editing,
    open,
    close,
    save,
    current: thresholds[editing ?? 'soil'],
  };
}
