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
 * ค่าจะถูกบีบให้อยู่ในช่วงตอนออกจากช่อง ไม่ใช่ระหว่างพิมพ์
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
        if (raw !== '' && !Number.isNaN(next)) {
          known.current = next;
          onCommit(next);
        }
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
