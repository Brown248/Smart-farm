import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/i18n/I18nProvider';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { TH } from '@/i18n/th';
import { DEFAULT_THRESHOLDS } from '@/data/dashboard';
import type { SensorKey, Threshold } from '@/data/dashboard';
import { ThresholdModal } from './ThresholdModal';

interface HarnessProps {
  readonly sensorKey?: SensorKey;
}

/** ตัวห่อเล็กๆ ให้เห็นว่า "บันทึกแล้วเก็บจริง" ไม่ใช่แค่เรียก callback */
function Harness({ sensorKey = 'soil' }: HarnessProps) {
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [open, setOpen] = useState(true);
  const current = thresholds[sensorKey];

  return (
    <I18nProvider>
      <FarmStateProvider>
        <div data-testid="stored">{`${current.warn}/${current.crit}`}</div>
        <button type="button" onClick={() => setOpen(true)}>
          reopen
        </button>
        <ThresholdModal
          sensorKey={open ? sensorKey : null}
          current={current}
          onCancel={() => setOpen(false)}
          onSave={(key: SensorKey, next: Threshold) => {
            setThresholds((prev) => ({ ...prev, [key]: next }));
            setOpen(false);
          }}
        />
      </FarmStateProvider>
    </I18nProvider>
  );
}

const stored = () => screen.getByTestId('stored').textContent;

describe('ThresholdModal', () => {
  it('มี input ตัวเลขจริงทั้งเกณฑ์เตือนและเกณฑ์วิกฤต', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: TH.thresholdTitle });
    const warn = within(dialog).getByLabelText(TH.warnBelow);
    const crit = within(dialog).getByLabelText(TH.critBelow);
    expect(warn).toHaveAttribute('type', 'number');
    expect(crit).toHaveAttribute('type', 'number');
    expect(warn).toHaveValue(DEFAULT_THRESHOLDS.soil.warn);
    expect(crit).toHaveValue(DEFAULT_THRESHOLDS.soil.crit);
  });

  it('พิมพ์แก้ค่าได้จริง (ไม่ใช่ข้อความนิ่ง)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const warn = screen.getByLabelText(TH.warnBelow);
    await user.clear(warn);
    await user.type(warn, '45');
    expect(warn).toHaveValue(45);
  });

  it('กดบันทึกแล้วค่าถูกเก็บจริงและหน้าต่างปิด', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(stored()).toBe('30/20');

    await user.clear(screen.getByLabelText(TH.warnBelow));
    await user.type(screen.getByLabelText(TH.warnBelow), '45');
    await user.clear(screen.getByLabelText(TH.critBelow));
    await user.type(screen.getByLabelText(TH.critBelow), '28');
    await user.click(screen.getByRole('button', { name: TH.save }));

    expect(stored()).toBe('45/28');
    expect(screen.queryByRole('dialog', { name: TH.thresholdTitle })).not.toBeInTheDocument();
  });

  it('ปุ่มยกเลิกแยกคำสั่งจากปุ่มบันทึก — ปิดแล้วค่าต้องไม่เปลี่ยน', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.clear(screen.getByLabelText(TH.warnBelow));
    await user.type(screen.getByLabelText(TH.warnBelow), '99');
    await user.click(screen.getByRole('button', { name: TH.cancel }));

    expect(stored()).toBe('30/20');
    expect(screen.queryByRole('dialog', { name: TH.thresholdTitle })).not.toBeInTheDocument();
  });

  it('เปิดใหม่แล้วเห็นค่าที่บันทึกไว้ล่าสุด', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.clear(screen.getByLabelText(TH.warnBelow));
    await user.type(screen.getByLabelText(TH.warnBelow), '45');
    await user.click(screen.getByRole('button', { name: TH.save }));

    await user.click(screen.getByRole('button', { name: 'reopen' }));
    expect(screen.getByLabelText(TH.warnBelow)).toHaveValue(45);
  });

  it('เว้นช่องว่างแล้วบันทึก จะคงค่าเดิมไว้ ไม่กลายเป็น NaN', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.clear(screen.getByLabelText(TH.warnBelow));
    await user.click(screen.getByRole('button', { name: TH.save }));
    expect(stored()).toBe('30/20');
  });

  it('sensorKey เป็น null = ไม่ render อะไรเลย', () => {
    const onSave = vi.fn();
    render(
      <I18nProvider>
        <FarmStateProvider>
          <ThresholdModal
            sensorKey={null}
            current={DEFAULT_THRESHOLDS.soil}
            onCancel={() => {}}
            onSave={onSave}
          />
        </FarmStateProvider>
      </I18nProvider>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
