import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LiveData from '@/config/liveData';

/**
 * ผู้ช่วย AI — สิ่งที่ต้องคุมคือ "ห้ามโกหกผู้ใช้" กับ "ห้ามค้าง"
 *   · ยังไม่ตั้งค่า → บอกชัด ไม่ใช่เงียบแล้วปล่อยให้คิดว่าถามไปแล้ว
 *   · ยิงผ่าน path ของ proxy เสมอ (ยิงตรงไป http:// จากหน้า HTTPS เบราว์เซอร์บล็อก)
 *   · คำตอบเพี้ยน/ค้าง → โยน error ที่แยกสาเหตุได้ ไม่ใช่คืนสตริงว่าง
 */
vi.mock('@/config/liveData', async (importOriginal) => {
  const actual = await importOriginal<typeof LiveData>();
  return { ...actual, readAiConfig: vi.fn() };
});

import { readAiConfig } from '@/config/liveData';
import { AiChatError, askFarmAi, type FarmSnapshot } from './aiChat';

const FARM: FarmSnapshot = {
  tempC: 33.4,
  humidityPct: 78,
  lightKlux: 42,
  soilPct: null,
  liveFields: ['temp'],
  devicesOn: ['big1'],
  estop: false,
};

const CFG = { baseUrl: '/ai-proxy/v1', model: 'qwen3.5-9b' };
const okBody = (content: string) => ({
  ok: true,
  json: () => Promise.resolve({ choices: [{ message: { content } }] }),
});

describe('askFarmAi', () => {
  beforeEach(() => vi.mocked(readAiConfig).mockReturnValue(CFG));
  afterEach(() => vi.unstubAllGlobals());

  it('ยังไม่ได้ตั้งค่า → โยน not-configured (ไม่ยิงคำขอทิ้งเปล่าๆ)', async () => {
    vi.mocked(readAiConfig).mockReturnValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(askFarmAi('ถามหน่อย', FARM, 'th')).rejects.toMatchObject({
      kind: 'not-configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ยิงผ่าน path ของ proxy + มี timeout + ส่งโมเดลที่ตั้งไว้', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okBody('ตอบแล้ว'));
    vi.stubGlobal('fetch', fetchMock);

    await askFarmAi('ร้อนไปไหม', FARM, 'th');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // ต้องเป็น path บน origin เดียวกัน ไม่ใช่ http://<ip> ตรงๆ (ไม่งั้นโดน mixed content)
    expect(url).toBe('/ai-proxy/v1/chat/completions');
    expect(url.startsWith('http')).toBe(false);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('qwen3.5-9b');
    expect(body.stream).toBe(false);
  });

  it('บอกโมเดลว่าสั่งอุปกรณ์ไม่ได้ และแนบค่าจริงของโรงเรือนไปด้วย', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okBody('ok'));
    vi.stubGlobal('fetch', fetchMock);

    await askFarmAi('เปิดพัดลมให้หน่อย', FARM, 'th');

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const sys = body.messages[0];
    expect(sys.role).toBe('system');
    // 🔴 กันโมเดลตอบว่า "เปิดให้แล้ว" — แอปนี้คุมรีเลย์จริง คำสั่งต้องผ่านปุ่มที่มี guard เท่านั้น
    expect(sys.content).toContain('CANNOT control any device');
    expect(sys.content).toContain('Never claim you turned anything on or off');
    expect(sys.content).toContain('33.4');
    // ต้องบอกด้วยว่าค่าไหนของจริง ไม่งั้นมันฟันธงจากเลขจำลอง
    expect(sys.content).toContain('values_from_real_sensors=[temp]');
    expect(body.messages[body.messages.length - 1]).toEqual({
      role: 'user',
      content: 'เปิดพัดลมให้หน่อย',
    });
  });

  /*
   * โมเดลตัวนี้ตอบภาษารัสเซีย/จีนถ้าสั่งเป็นภาษาไทย (ทดสอบกับเครื่องจริงแล้ว)
   * คำสั่งต้องเป็นภาษาอังกฤษ + ระบุภาษาเป้าหมายด้วยตัวอักษรของภาษานั้น + ย้ำท้ายสุด
   * เทสนี้ล็อกสูตรไว้ ถ้ามีคนแปลคำสั่งกลับเป็นภาษาไทยจะ fail ทันที
   */
  it('บังคับภาษาด้วยคำสั่งภาษาอังกฤษ + ย้ำท้ายสุด', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okBody('ok'));
    vi.stubGlobal('fetch', fetchMock);

    await askFarmAi('hello', FARM, 'en');
    const en = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string).messages[0]
      .content as string;
    expect(en).toContain('reply in English only');
    expect(en.trimEnd().endsWith('Reminder: reply in English only.')).toBe(true);

    await askFarmAi('สวัสดี', FARM, 'th');
    const th = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string).messages[0]
      .content as string;
    expect(th).toContain('reply in Thai language (ภาษาไทย) only');
    expect(th.trimEnd().endsWith('Reminder: reply in Thai (ภาษาไทย) only.')).toBe(true);
  });

  it('หมดเวลา → kind timeout (แยกจาก network เพื่อบอกผู้ใช้ให้ถูก)', async () => {
    const err = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));
    await expect(askFarmAi('x', FARM, 'th')).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('HTTP ไม่ใช่ 2xx → kind network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(askFarmAi('x', FARM, 'th')).rejects.toBeInstanceOf(AiChatError);
  });

  it('คำตอบว่าง/ผิดรูป → kind bad-response (ไม่คืนสตริงว่างให้ขึ้นฟองเปล่า)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okBody('   ')));
    await expect(askFarmAi('x', FARM, 'th')).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('สำเร็จ → คืนข้อความที่ตัดช่องว่างหัวท้ายแล้ว', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okBody('  ควรเปิดพัดลม  ')));
    await expect(askFarmAi('x', FARM, 'th')).resolves.toBe('ควรเปิดพัดลม');
  });
});
