import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHsTracker,
  HsPostTimeoutError,
  HsTrackError,
  newReqId,
  postHsCommand,
} from './handysenseControl';
import type { CommandResult } from '@/config/commandResult';

describe('newReqId', () => {
  it('ไม่ซ้ำกันแม้เรียกรัวๆ (กันคำสั่งหายเงียบ)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(newReqId());
    expect(ids.size).toBe(1000);
  });
});

describe('postHsCommand', () => {
  const ctx = {
    apiBase: 'https://backend-prod.synexta.ai/api/v1',
    deviceId: 'dev-1',
    token: 'tok-abc',
  };

  afterEach(() => vi.unstubAllGlobals());

  it('ยิง POST ถูก URL + Bearer + body scope SHARED_SCOPE พร้อม reqId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await postHsCommand(ctx, { action: 'setSwitch', channel: 0, on: true }, 'req-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://backend-prod.synexta.ai/api/v1/devices/dev-1/attributes');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-abc');
    const body = JSON.parse(init.body as string);
    expect(body.scope).toBe('SHARED_SCOPE');
    expect(body.attributes.cmd).toEqual({
      action: 'setSwitch',
      channel: 0,
      on: true,
      reqId: 'req-1',
    });
  });

  it('no-auto ไม่มี temp/soil ใน body (undefined ถูกตัดทิ้งตอน stringify)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await postHsCommand(ctx, { action: 'setThreshold', channel: 1, mode: 'no-auto' }, 'req-2');
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.attributes.cmd).toEqual({
      action: 'setThreshold',
      channel: 1,
      mode: 'no-auto',
      reqId: 'req-2',
    });
    expect('temp' in body.attributes.cmd).toBe(false);
  });

  it('HTTP ไม่ใช่ 2xx → โยน error (เช่น token หมดอายุ)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(
      postHsCommand(ctx, { action: 'setSwitch', channel: 0, on: false }, 'req-3'),
    ).rejects.toThrow('hs-post-failed:401');
  });

  /*
   * เบราว์เซอร์ไม่มี timeout ให้ `fetch` — ถ้าไม่ส่ง signal คำขอค้างได้เป็นนาที
   * แล้ว `pending` ของปุ่มไม่มีวันถูกปลด ผู้ใช้ต้องรีโหลดหน้าถึงจะสั่งได้อีก
   */
  it('ส่ง AbortSignal ที่มี timeout ไปกับ fetch เสมอ', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await postHsCommand(ctx, { action: 'setSwitch', channel: 0, on: true }, 'req-4');

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it('ครบเวลา (TimeoutError) → โยน HsPostTimeoutError ไม่ปนกับ network error', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));

    await expect(
      postHsCommand(ctx, { action: 'setSwitch', channel: 0, on: true }, 'req-5'),
    ).rejects.toBeInstanceOf(HsPostTimeoutError);
  });

  it('network/CORS error → โยน error เดิม (ไม่ใช่ HsPostTimeoutError)', async () => {
    const netErr = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(netErr));

    const p = postHsCommand(ctx, { action: 'setSwitch', channel: 0, on: true }, 'req-6');
    await expect(p).rejects.toBe(netErr);
    await expect(p).rejects.not.toBeInstanceOf(HsPostTimeoutError);
  });
});

describe('createHsTracker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const ok = (reqId: string): CommandResult => ({ ok: true, at: 1, reqId, channel: 0 });
  const fail = (reqId: string): CommandResult => ({ ok: false, at: 1, reqId, error: 'boom' });

  it('reqId ตรง + ok:true → resolve', async () => {
    const t = createHsTracker();
    const p = t.track('r1');
    t.feed(ok('r1'));
    await expect(p).resolves.toMatchObject({ ok: true, reqId: 'r1' });
    expect(t.pendingCount()).toBe(0);
  });

  it('reqId ตรง + ok:false → reject เป็น failed พร้อม result', async () => {
    const t = createHsTracker();
    const p = t.track('r2');
    t.feed(fail('r2'));
    await expect(p).rejects.toBeInstanceOf(HsTrackError);
    await p.catch((e: HsTrackError) => {
      expect(e.failure).toEqual({ kind: 'failed', result: fail('r2') });
    });
  });

  it('reqId ไม่ตรง → ข้าม (ยังรออยู่)', () => {
    const t = createHsTracker();
    void t.track('r3');
    t.feed(ok('other'));
    expect(t.pendingCount()).toBe(1);
  });

  it('ครบ 15 วิ ไม่มีผล → reject เป็น timeout ("ไม่ทราบผล")', async () => {
    const t = createHsTracker();
    const p = t.track('r4');
    const assertion = expect(p).rejects.toMatchObject({ failure: { kind: 'timeout' } });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(t.pendingCount()).toBe(0);
  });

  it('clear() ยกเลิกทุก request ที่ค้าง', async () => {
    const t = createHsTracker();
    const p = t.track('r5');
    const assertion = expect(p).rejects.toBeInstanceOf(HsTrackError);
    t.clear();
    await assertion;
    expect(t.pendingCount()).toBe(0);
  });
});
