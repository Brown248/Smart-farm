import { describe, expect, it } from 'vitest';
import { parseCommandResult, readCommandResult } from './commandResult';

/**
 * parser ของ `cmd_result` — ใช้ payload จริงที่ capture จาก handysense-farm
 * (สองแบบที่ device ยิงมาจริง · ห้ามเดา field เอง)
 */
describe('parseCommandResult', () => {
  it('คำสั่งสำเร็จจริง → ok:true พร้อม channel', () => {
    const r = parseCommandResult('{"ok":true,"channel":3,"reqId":"t1"}', 1000);
    expect(r).toEqual({ ok: true, at: 1000, channel: 3, reqId: 't1' });
  });

  it('คำสั่งล้มเหลวจริง (ผูกกับคำสั่ง — มี reqId) → ok:false พร้อม error + reqId', () => {
    const r = parseCommandResult('{"ok":false,"error":"device busy","reqId":"t3"}', 2000);
    expect(r).toEqual({ ok: false, at: 2000, error: 'device busy', reqId: 't3' });
  });

  it('🔴 ขยะจาก backend ปัดตกคำสั่งผิดรูป (ไม่มี reqId/channel · ไม่ใช่ partial) → null (ไม่โชว์ "ล้มเหลว" ค้าง)', () => {
    // payload จริงที่ retain ค้างบนสตรีมตอน backend ปฏิเสธคำสั่งลบตาราง — ผูกกับคำสั่งไหนไม่ได้
    expect(
      parseCommandResult(
        '{"ok":false,"action":"","error":"unknown error","publishedCount":0,"partial":false,"reqId":""}',
        2000,
      ),
    ).toBeNull();
  });

  it('partial:false → ไม่เก็บ (ค่าปกติ ไม่รก) · แต่คงผลไว้เพราะมี reqId', () => {
    const r = parseCommandResult('{"ok":false,"error":"x","partial":false,"reqId":"t4"}', 1);
    expect(r).toEqual({ ok: false, at: 1, error: 'x', reqId: 't4' });
  });

  it('🔴 partial:true → เก็บ partial + publishedCount (อุปกรณ์ค้างครึ่งทาง ต้องเตือนแรง)', () => {
    const r = parseCommandResult(
      '{"ok":false,"partial":true,"publishedCount":2,"error":"temp: min must be less than max","reqId":"t2"}',
      3,
    );
    expect(r).toEqual({
      ok: false,
      at: 3,
      error: 'temp: min must be less than max',
      reqId: 't2',
      partial: true,
      publishedCount: 2,
    });
  });

  it('อ่าน JSON ไม่ออก → null (ไม่ throw ทั้งหน้า)', () => {
    expect(parseCommandResult('{not json', 1)).toBeNull();
    expect(parseCommandResult('', 1)).toBeNull();
    expect(parseCommandResult(null, 1)).toBeNull();
  });

  it('ไม่มี field ok → null (ไม่ใช่ผลคำสั่งที่ใช้ได้)', () => {
    expect(parseCommandResult('{"channel":3}', 1)).toBeNull();
    expect(parseCommandResult('"just a string"', 1)).toBeNull();
    expect(parseCommandResult('42', 1)).toBeNull();
  });
});

describe('readCommandResult', () => {
  it('ดึงจาก telemetry ทั้งก้อน โดยใช้ timestamp ของ key นั้น', () => {
    const r = readCommandResult({
      temperature: { value: '30', timestamp: 5 },
      cmd_result: { value: '{"ok":true,"channel":2}', timestamp: 1700 },
    });
    expect(r).toEqual({ ok: true, at: 1700, channel: 2 });
  });

  it('ไม่มี cmd_result → null', () => {
    expect(readCommandResult({ temperature: { value: '30', timestamp: 5 } })).toBeNull();
  });
});
