import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberField } from './NumberField';

/**
 * ช่องกรอกตัวเลขมีสองกฎที่ขัดกันในตัว และต้องได้ทั้งคู่:
 *   1. ห้าม clamp ระหว่างพิมพ์ — พิมพ์ `36` ในช่วง 20-45 ต้องไม่กลายเป็น `20` แล้ว `45`
 *      (กับดักข้อ 6 ใน CLAUDE.md · เคยเป็นบั๊กจริง)
 *   2. ห้ามส่งค่านอกช่วงออกไปให้ผู้เรียก — ผู้เรียกบางรายเอาไปตัดสินใจทันที
 *      เช่นเกณฑ์ความชื้นที่ต้อง `onAt > offAt` ไม่งั้นเครื่องมือดูดอากาศปิดตัวเอง
 */
function Harness({ onCommit, initial = 30 }: { onCommit: (v: number) => void; initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NumberField
        ariaLabel="เกณฑ์"
        value={value}
        min={20}
        max={45}
        onCommit={(v) => {
          setValue(v);
          onCommit(v);
        }}
      />
      <button type="button">ออกจากช่อง</button>
    </>
  );
}

describe('NumberField', () => {
  it('พิมพ์ 36 → เห็น 36 จริง (ไม่ถูก clamp เป็น 20 ระหว่างทาง)', async () => {
    const user = userEvent.setup();
    render(<Harness onCommit={vi.fn()} />);
    const input = screen.getByLabelText('เกณฑ์');

    await user.clear(input);
    await user.type(input, '36');

    expect(input).toHaveValue(36);
  });

  it('เลขที่ยังนอกช่วงระหว่างพิมพ์ ต้องไม่ถูกส่งออกไปให้ผู้เรียก', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText('เกณฑ์');

    await user.clear(input);
    await user.type(input, '36');

    // '3' อยู่นอกช่วง 20-45 → ห้ามหลุดออกไป · '36' อยู่ในช่วง → ส่งได้
    expect(onCommit).toHaveBeenCalledWith(36);
    expect(onCommit.mock.calls.flat()).not.toContain(3);
  });

  it('พิมพ์เกินช่วงแล้วออกจากช่อง → บีบให้อยู่ในช่วงแล้วส่งค่าที่บีบแล้ว', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText('เกณฑ์');

    await user.clear(input);
    await user.type(input, '99');
    // ระหว่างพิมพ์ยังไม่ส่ง (99 เกิน max)
    expect(onCommit.mock.calls.flat()).not.toContain(99);

    await user.click(screen.getByRole('button', { name: 'ออกจากช่อง' }));

    expect(onCommit).toHaveBeenLastCalledWith(45);
    expect(input).toHaveValue(45);
  });

  it('ลบจนว่างแล้วออกจากช่อง → กลับไปใช้ค่าเดิม ไม่กลายเป็น NaN', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} initial={30} />);
    const input = screen.getByLabelText('เกณฑ์');

    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'ออกจากช่อง' }));

    expect(onCommit).toHaveBeenLastCalledWith(30);
    expect(input).toHaveValue(30);
  });
});
