import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('ปุ่มปกติกดได้และเรียก handler', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>เปิด</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'เปิด' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ตอน pending ต้อง disabled และกดไม่ติด', async () => {
    const onClick = vi.fn();
    render(
      <Button pending onClick={onClick}>
        กำลังส่งคำสั่ง…
      </Button>,
    );
    const btn = screen.getByRole('button', { name: /กำลังส่งคำสั่ง/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ส่ง disabled มาตรงๆ ก็ต้องกดไม่ติด', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        ไม่พร้อมใช้งาน
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'ไม่พร้อมใช้งาน' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('type เริ่มต้นเป็น button ไม่ submit ฟอร์มโดยไม่ตั้งใจ', () => {
    render(<Button>ตกลง</Button>);
    expect(screen.getByRole('button', { name: 'ตกลง' })).toHaveAttribute('type', 'button');
  });
});
