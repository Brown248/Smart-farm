import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AllMetricsChart, MetricLineChart } from './LineChart';
import { historyFor } from '@/data/mockSensorHistory';

const LABELS = { temp: 'อุณหภูมิ', hum: 'ความชื้นอากาศ', soil: 'ความชื้นดิน', light: 'แสง' };

function single() {
  return render(
    <MetricLineChart
      metric="temp"
      range="day"
      compare={false}
      splitAxis
      latestLabel="ล่าสุด"
      bandLabel="ช่วงเหมาะสม"
      metricLabel={LABELS.temp}
      animate={false}
    />,
  );
}

describe('กราฟประวัติ', () => {
  /**
   * เคยใช้ viewBox คงที่ + preserveAspectRatio="none" ทำให้ตัวหนังสือกับวงกลมยืดผิดส่วน
   * ตอนนี้ต้องวาดเป็นพิกเซล 1:1 — width/height ของ svg ต้องเท่ากับ viewBox เสมอ
   */
  it('วาดแบบ 1:1 ไม่ยืดผิดสัดส่วน', () => {
    const { container } = single();
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('preserveAspectRatio')).toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe(
      `0 0 ${svg?.getAttribute('width')} ${svg?.getAttribute('height')}`,
    );
  });

  it('บอกค่าล่าสุดผ่าน aria-label ให้ screen reader อ่านได้', () => {
    single();
    const values = historyFor('temp', 'day');
    const last = values[values.length - 1]!;
    expect(
      screen.getByRole('img', { name: new RegExp(`${LABELS.temp}.*${last.toFixed(1)}°C`) }),
    ).toBeInTheDocument();
  });

  it('กด → ตอนโฟกัสแล้วขึ้นกล่องค่า และ Escape แล้วหายไป', async () => {
    const user = userEvent.setup();
    single();
    const svg = screen.getByRole('img');

    svg.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText(LABELS.temp)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText(LABELS.temp)).not.toBeInTheDocument();
  });

  it('กราฟรวม 4 ค่า: เลื่อนดูแล้วบอกค่าครบทั้ง 4 เส้นที่จุดเดียวกัน', async () => {
    const user = userEvent.setup();
    render(<AllMetricsChart range="day" label="ทุกค่ารวม" metricLabels={LABELS} />);

    screen.getByRole('img').focus();
    await user.keyboard('{ArrowRight}');

    for (const name of Object.values(LABELS)) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });
});
