import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAutoToken, resetAutoAuthForTest, startAutoAuth } from './autoAuth';
import { getTokenSource, resetTokenProviderForTest, tokenProvider } from './tokenProvider';

/**
 * โหมด LAN — เซิร์ฟเวอร์ล็อกอินแทนผู้ใช้ ไม่ต้องมีหน้าล็อกอิน
 *
 * สิ่งที่ต้องคุม:
 *   1. ได้ token แล้วเข้า `tokenProvider` จริง (ไม่งั้น socket/คำสั่งอุปกรณ์ไม่ได้ใช้)
 *   2. เซิร์ฟเวอร์ไม่ได้เปิดโหมดนี้ (404) → **เงียบ** ไม่พังและไม่รีทราย ปล่อยให้ล็อกอินเอง
 *   3. ตั้งเวลาขอใหม่ก่อน token หมดอายุ — แท็บติดผนังต้องไม่หลุดทุกชั่วโมง
 *   4. ล้มเหลว → ถอยเป็นขั้น ไม่ยิงรัว (Supabase มี rate limit ถ้าโดนจะล็อกอินไม่ได้ทั้งระบบ)
 */

/** JWT ปลอมที่อ่าน `exp` ได้ — ไม่ต้องเซ็นจริงเพราะโค้ดอ่านแค่ payload */
function fakeJwt(expSec: number): string {
  const payload = btoa(JSON.stringify({ exp: expSec })).replace(/=+$/, '');
  return `h.${payload}.s`;
}

const NOW = 1_700_000_000_000;

describe('ขอ token เองจากเซิร์ฟเวอร์ (โหมด LAN)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    resetAutoAuthForTest();
    resetTokenProviderForTest();
  });
  afterEach(() => {
    resetAutoAuthForTest();
    resetTokenProviderForTest();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('ได้ token แล้วส่งเข้า tokenProvider จริง', async () => {
    const token = fakeJwt(Math.floor(NOW / 1000) + 3600);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: token }) }),
    );

    await expect(startAutoAuth()).resolves.toBe(true);
    expect(tokenProvider.getToken()).toBe(token);
    expect(getTokenSource()).toBe('supabase');
  });

  it('เซิร์ฟเวอร์ไม่ได้เปิดโหมดนี้ (404) → เงียบ ไม่ตั้ง token และไม่รีทราย', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    vi.stubGlobal('fetch', f);

    await expect(startAutoAuth()).resolves.toBe(false);
    expect(tokenProvider.getToken()).toBeNull();

    // เดินเวลาไปไกลๆ ต้องไม่มีการยิงซ้ำ — 404 แปลว่า "ไม่ได้เปิดไว้" ไม่ใช่ "ล้มเหลวชั่วคราว"
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('ตั้งเวลาขอใหม่ก่อน token หมดอายุ — แท็บเปิดค้างต้องไม่หลุด', async () => {
    const first = fakeJwt(Math.floor(NOW / 1000) + 3600);
    const second = fakeJwt(Math.floor(NOW / 1000) + 7200);
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: first }) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: second }) });
    vi.stubGlobal('fetch', f);

    await startAutoAuth();
    expect(tokenProvider.getToken()).toBe(first);

    // 60 นาที ลบระยะเผื่อ 3 นาที = ขอใหม่ที่นาทีที่ 57
    await vi.advanceTimersByTimeAsync(57 * 60 * 1000);
    expect(f).toHaveBeenCalledTimes(2);
    expect(tokenProvider.getToken()).toBe(second);
  });

  it('เซิร์ฟเวอร์พัง (500) → ถอยเป็นขั้น ไม่ยิงรัวจนโดน rate limit', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', f);

    await fetchAutoToken();
    expect(f).toHaveBeenCalledTimes(1);

    // ครั้งถัดไปต้องรออย่างน้อย 30 วิ ไม่ใช่ยิงทันที
    await vi.advanceTimersByTimeAsync(29_000);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(f).toHaveBeenCalledTimes(2);

    // รอบที่สามต้องรอนานกว่าเดิม (ถอยเป็นขั้น) — 30 วิ ยังไม่ถึง
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('คำตอบไม่มี access_token → ถือว่าล้มเหลว ไม่ตั้ง token มั่ว', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ error: 'nope' }) }),
    );

    await expect(fetchAutoToken()).resolves.toBe(false);
    expect(tokenProvider.getToken()).toBeNull();
  });
});
