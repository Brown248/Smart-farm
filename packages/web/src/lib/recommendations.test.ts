import { describe, expect, it } from 'vitest';
import { DEFAULT_RECOMMENDATION_INPUT, buildRecommendations } from './recommendations';
import type { RecommendationInput } from './recommendations';

const base = (over: Partial<RecommendationInput> = {}): RecommendationInput => ({
  ...DEFAULT_RECOMMENDATION_INPUT,
  ...over,
});

// ค่าจริงทุกตัวอยู่ในเกณฑ์ (ไม่มีอะไรต้องแนะนำ)
const allOk = base({ soilB: 55, temp: 28, rh: 68 });

describe('buildRecommendations — อิงค่าจริงล้วน', () => {
  it('ค่าเริ่มต้น (ดินแห้ง+ร้อน+ชื้น): มีแต่การ์ดที่มาจากค่าจริง เรียงตามความด่วน · ไม่มี mock', () => {
    const ids = buildRecommendations(base()).map((x) => x.id);
    // ร้อน(crit,5) → ชื้น(crit,8) → ดินแห้ง(warn,10)
    expect(ids).toEqual(['cool-house', 'dehumidify', 'water-b']);
    // การ์ด mock/hardcode เดิมต้องหายหมด
    for (const gone of ['prune-h', 'harvest-e', 'fert-e']) expect(ids).not.toContain(gone);
  });

  it('ทุกค่าอยู่ในเกณฑ์ → ไม่มีอะไรต้องทำ (ลิสต์ว่าง)', () => {
    expect(buildRecommendations(allOk)).toEqual([]);
  });

  it('เรียงตามความด่วน — เรื่องด่วนสุดอยู่บน', () => {
    const r = buildRecommendations(base());
    const urg = r.map((x) => x.urgency);
    expect([...urg].sort((a, b) => a - b)).toEqual(urg);
  });

  it('ดินต่ำกว่าเกณฑ์วิกฤต → รดน้ำเป็นวิกฤตและด่วนสุด', () => {
    const r = buildRecommendations(allOk).concat(
      buildRecommendations(base({ soilB: 15, temp: 28, rh: 68 })),
    );
    const water = r.find((x) => x.id === 'water-b');
    expect(water?.level).toBe('crit');
    expect(buildRecommendations(base({ soilB: 15, temp: 28, rh: 68 }))[0]?.id).toBe('water-b');
  });

  it('ดินไม่ใช่ค่าจริง (ไม่มีเซนเซอร์) → ไม่แนะนำรดน้ำจากค่าจำลอง', () => {
    const r = buildRecommendations(base({ soilLive: false, soilB: 10, temp: 28, rh: 68 }));
    expect(r.find((x) => x.id === 'water-b')).toBeUndefined();
  });

  it('เซนเซอร์ค่าค้าง → มีรายการไปตรวจเซนเซอร์', () => {
    const r = buildRecommendations(base({ stuckSensors: ['soil'] }));
    expect(r.find((x) => x.id === 'sensor-g')).toBeDefined();
  });

  it('อุณหภูมิร้อนเกินช่วง (ค่าจริง) → แนะนำระบายความร้อน · ในเกณฑ์/ไม่ใช่ค่าจริง = ไม่แนะนำ', () => {
    expect(buildRecommendations(allOk).find((x) => x.id === 'cool-house')).toBeUndefined();
    expect(
      buildRecommendations(base({ temp: 39, tempLive: false, soilB: 55, rh: 68 })).find(
        (x) => x.id === 'cool-house',
      ),
    ).toBeUndefined();
    expect(
      buildRecommendations(base({ temp: 39, soilB: 55, rh: 68 })).find(
        (x) => x.id === 'cool-house',
      ),
    ).toBeDefined();
  });

  it('ความชื้นสูงเกินช่วง (ค่าจริง) → แนะนำดูดอากาศ', () => {
    expect(
      buildRecommendations(base({ rh: 86, soilB: 55, temp: 28 })).find(
        (x) => x.id === 'dehumidify',
      ),
    ).toBeDefined();
    expect(buildRecommendations(allOk).find((x) => x.id === 'dehumidify')).toBeUndefined();
  });

  it('ไม่มีรายการที่มาจากปฏิทินดูแลอีกแล้ว', () => {
    expect(buildRecommendations(base()).some((x) => x.id.startsWith('cal-'))).toBe(false);
  });

  it('ทุกรายการมีข้อความครบ + route ไปหน้าที่ถูก', () => {
    for (const r of buildRecommendations(base())) {
      expect(r.titleKey.length).toBeGreaterThan(0);
      expect(r.whyKey.length).toBeGreaterThan(0);
      expect(r.ctaKey.length).toBeGreaterThan(0);
      expect(['irrigation', 'greenhouse']).toContain(r.route);
    }
    // ร้อน/ชื้น ไปคุมพัดลมที่โรงเรือน · น้ำไปชลประทาน
    const byId = Object.fromEntries(buildRecommendations(base()).map((r) => [r.id, r.route]));
    expect(byId['cool-house']).toBe('greenhouse');
    expect(byId['dehumidify']).toBe('greenhouse');
    expect(byId['water-b']).toBe('irrigation');
  });

  it('ไม่มี id ซ้ำ', () => {
    const ids = buildRecommendations(base()).map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
