import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Gauge } from './Gauge';
import { hudCards } from '@/lib/status';
import { TH } from '@/i18n/th';

describe('Gauge', () => {
  it('arc กางตามค่าที่ส่งเข้ามา', () => {
    render(<Gauge deg="180.0deg" color="var(--st-ok)" />);
    const ring = screen.getByTestId('gauge');
    expect(ring).toHaveAttribute('data-deg', '180.0deg');
    expect(ring.style.getPropertyValue('--fs-deg')).toBe('180.0deg');
    expect(ring.style.getPropertyValue('--fs-rc')).toBe('var(--st-ok)');
  });

  it('ค่าจาก hudCards แปลงเป็นองศาแล้ววาดได้จริง', () => {
    // rh = 60 อยู่กึ่งกลางสเกล 20–100 → 50% ของ 360 องศา
    const card = hudCards({ temp: 27, rh: 60, lux: 30 }, TH)[1];
    expect(card?.key).toBe('rh');
    expect(card?.deg).toBe('180.0deg');
    render(<Gauge deg={card!.deg} color={card!.color} />);
    expect(screen.getByTestId('gauge').style.getPropertyValue('--fs-deg')).toBe('180.0deg');
  });

  it('ค่าต่ำสุดยังเหลือ arc อย่างน้อย 6 องศาให้เห็นว่ามีวง', () => {
    const card = hudCards({ temp: 10, rh: 20, lux: 0 }, TH)[0];
    expect(card?.deg).toBe('6.0deg');
  });
});
