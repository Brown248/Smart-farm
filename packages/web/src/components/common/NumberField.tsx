import { useEffect, useRef, useState } from 'react';
import { clamp } from '@/lib/format';

export interface NumberFieldProps {
  readonly id?: string | undefined;
  readonly className?: string | undefined;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number | undefined;
  readonly ariaLabel?: string | undefined;
  readonly onCommit: (value: number) => void;
}

/**
 * ช่องกรอกตัวเลขที่ "พิมพ์ได้จริง"
 *
 * เก็บข้อความที่กำลังพิมพ์ไว้ในตัวเอง เพราะถ้าผูกกับตัวเลขตรงๆ การลบจนว่าง
 * จะทำให้ค่าเด้งกลับทันที แล้วพิมพ์ต่อกลายเป็นเลขมั่ว (เช่น ลบ 70 แล้วพิมพ์ 78 ได้ 7078)
 *
 * **ห้าม clamp ระหว่างพิมพ์** — พิมพ์ `36` ในช่วง 20-45 จะกลายเป็น `20` แล้ว `45` (เคยเป็นบั๊กมาแล้ว)
 * แต่ก็ **ห้ามส่งค่านอกช่วงออกไป** เพราะผู้เรียกบางรายเอาไปตัดสินใจทันที
 * (เช่น เกณฑ์ความชื้นที่ต้อง `onAt > offAt` ไม่งั้นเครื่องมือปิดตัวเอง)
 *
 * กติกาจึงเป็น: ระหว่างพิมพ์ส่งออก**เฉพาะค่าที่อยู่ในช่วงแล้ว** · เลขที่ยังพิมพ์ไม่เสร็จเก็บไว้ใน draft เฉยๆ
 * · ตอนออกจากช่องจึง clamp แล้วส่งเสมอ
 */
export function NumberField({
  id,
  className,
  value,
  min,
  max,
  step,
  ariaLabel,
  onCommit,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(() => String(value));
  const known = useRef(value);

  useEffect(() => {
    if (value !== known.current) {
      known.current = value;
      setDraft(String(value));
    }
  }, [value]);

  return (
    <input
      id={id}
      className={className}
      type="number"
      inputMode="decimal"
      value={draft}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const next = Number(raw);
        // ยังพิมพ์ไม่เสร็จ (ว่าง / ไม่ใช่ตัวเลข / ยังนอกช่วง) → เก็บไว้ใน draft เฉยๆ ไม่ส่งออก
        if (raw === '' || Number.isNaN(next)) return;
        if (next < min || next > max) return;
        known.current = next;
        onCommit(next);
      }}
      onBlur={() => {
        const parsed = Number(draft);
        const base = draft === '' || Number.isNaN(parsed) ? value : parsed;
        const next = clamp(base, min, max);
        known.current = next;
        setDraft(String(next));
        onCommit(next);
      }}
    />
  );
}
