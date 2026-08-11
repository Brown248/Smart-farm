import { describe, expect, it } from 'vitest';
import type { ZoneReading } from '@shared/zone';
import { TH } from '@/i18n/th';
import { AGENT_POSES, POSE_SRC, pickAgent, poseEntryAnimation } from './agentPose';
import type { AgentContext } from './agentPose';
import { hudCards } from './status';

const zone = (id: ZoneReading['id'], status: ZoneReading['status'], soil: number): ZoneReading => ({
  id,
  status,
  soil,
});

const okZones: ZoneReading[] = [zone('kale', 'ok', 62), zone('flower', 'ok', 58)];

const base = (over: Partial<AgentContext> = {}): AgentContext => ({
  estop: false,
  busy: false,
  presentation: false,
  zones: okZones,
  climateBad: undefined,
  rain: false,
  rh: 70,
  night: false,
  t: TH,
  zoneName: (z) => 'โซน' + z.id,
  ...over,
});

/** การ์ดที่หลุดเกณฑ์จริง ใช้เป็นอินพุตของสาขา climate */
const badCard = hudCards({ temp: 38, rh: 70, lux: 30 }, TH)[0]!;

describe('ลำดับความสำคัญของข้อความ agent', () => {
  it('มี 9 ท่า และทุกท่ามีไฟล์ภาพ', () => {
    expect(AGENT_POSES).toHaveLength(9);
    for (const p of AGENT_POSES) expect(POSE_SRC[p]).toMatch(/^\/assets\/agent\/.+\.png$/);
  });

  it('1 · หยุดฉุกเฉินมาก่อนทุกอย่าง', () => {
    const r = pickAgent(
      base({
        estop: true,
        busy: true,
        presentation: true,
        zones: [zone('strawberry', 'critical', 28)],
        climateBad: badCard,
        rain: true,
        rh: 90,
        night: true,
      }),
    );
    expect(r.pose).toBe('warning');
    expect(r.message).toBe(TH.aEstop);
  });

  it('2 · กำลังส่งคำสั่ง มาก่อนโหมดนำเสนอ', () => {
    const r = pickAgent(
      base({ busy: true, presentation: true, zones: [zone('strawberry', 'critical', 28)] }),
    );
    expect(r.pose).toBe('loading');
    expect(r.message).toBe(TH.aBusy);
  });

  it('3 · โหมดนำเสนอ มาก่อนโซนวิกฤต', () => {
    const r = pickAgent(base({ presentation: true, zones: [zone('strawberry', 'critical', 28)] }));
    expect(r.pose).toBe('celebration');
    expect(r.message).toBe(TH.aPres);
  });

  it('4 · โซนวิกฤต มาก่อนฝนและค่าอากาศ', () => {
    const r = pickAgent(
      base({
        zones: [zone('strawberry', 'critical', 28.4)],
        rain: true,
        rh: 90,
        climateBad: badCard,
      }),
    );
    expect(r.pose).toBe('pointing');
    expect(r.message).toBe(TH.aCrit('โซนstrawberry', 28));
  });

  it('5 · ฝน + ความชื้น > 80% มาก่อนค่าอากาศ (ตามต้นแบบ)', () => {
    const r = pickAgent(base({ rain: true, rh: 84, climateBad: badCard }));
    expect(r.pose).toBe('idea');
    expect(r.message).toBe(TH.aRain);
  });

  it('5 · ฝนแต่ความชื้นไม่ถึง 80% → ตกไปที่ค่าอากาศ', () => {
    const r = pickAgent(base({ rain: true, rh: 74, climateBad: badCard }));
    expect(r.pose).toBe('warning');
    expect(r.message).toBe(TH.aClimate(badCard.label, badCard.value, badCard.note));
  });

  it('6 · ค่าอากาศหลุดเกณฑ์ มาก่อนโซนที่ความชื้นต่ำ', () => {
    const r = pickAgent(base({ zones: [zone('tomato', 'low', 39)], climateBad: badCard }));
    expect(r.pose).toBe('warning');
  });

  // เดิมมีเคสเทียบกับ 'กำลังรดน้ำ' — ถอดออกแล้ว โรงเรือนนี้ไม่มีระบบรดน้ำ (DESIGN_SOURCE ข้อ 37)
  it('7 · โซนความชื้นต่ำ มาก่อนกลางคืน', () => {
    const r = pickAgent(base({ zones: [zone('tomato', 'low', 39.2)], night: true }));
    expect(r.pose).toBe('curious');
    expect(r.message).toBe(TH.aLow('โซนtomato', 39));
  });

  it('9 · กลางคืนแล้วทุกอย่างปกติ → งีบ', () => {
    const r = pickAgent(base({ night: true }));
    expect(r.pose).toBe('happy');
    expect(r.message).toBe(TH.aNight);
    expect(r.sleeping).toBe(true);
  });

  it('10 · กลางวันและทุกโซนเขียว → ทักทาย (โบกมือ)', () => {
    const r = pickAgent(base());
    expect(r.pose).toBe('greeting');
    expect(r.message).toBe(TH.aAllGreen);
    expect(r.sleeping).toBe(false);
  });

  it('โซนวิกฤตถูกเลือกก่อนโซนที่แค่ต่ำ', () => {
    const r = pickAgent(
      base({ zones: [zone('tomato', 'low', 39), zone('strawberry', 'critical', 28)] }),
    );
    expect(r.pose).toBe('pointing');
  });

  it('animation ตอนเปลี่ยนท่า ตรงตามกลุ่ม', () => {
    expect(poseEntryAnimation('celebration')).toContain('fsHop');
    expect(poseEntryAnimation('pointing')).toContain('fsShake');
    expect(poseEntryAnimation('warning')).toContain('fsShake');
    expect(poseEntryAnimation('happy')).toBe('fsPoseIn .35s ease');
  });
});
