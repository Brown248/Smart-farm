import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useTelemetry } from './useTelemetry';
import type { UseTelemetryResult } from './useTelemetry';

/**
 * เทส hook ที่หน้าเพจใช้จริง
 *
 * สองเรื่องที่ต้องคุมให้ได้:
 *   1. **ยังไม่ได้ตั้งค่า / ยังไม่มี token → ห้ามเปิด socket** และต้องคืนสถานะ `mock`
 *      แอปต้องใช้ข้อมูลจำลองต่อได้ ไม่ error
 *   2. **unmount แล้วต้อง unsubscribe + disconnect** ไม่งั้น backend เปิด WS ไป TB ค้างไว้
 */

const mocks = vi.hoisted(() => ({
  config: { value: null as null | Record<string, string> },
  session: { token: null as string | null },
  tokenListeners: new Set<(t: string | null) => void>(),
  handles: [] as { closed: number; opts: Record<string, unknown> }[],
  handlers: { current: {} as Record<string, ((e: unknown) => void) | undefined> },
  refreshCalls: { n: 0, willSucceed: true },
}));

vi.mock('@/config/liveData', () => ({
  readLiveDataConfig: () => mocks.config.value,
  missingLiveEnv: () => (mocks.config.value ? [] : ['VITE_WS_URL']),
  isLiveConfigured: () => mocks.config.value !== null,
  LIVE_ENV_KEYS: ['VITE_WS_URL'],
}));

/**
 * เว็บไม่ทำ login เอง — token มาจาก `tokenProvider` (URL / parent frame / ช่องกรอกโหมด dev)
 * เทสจึงคุม token ผ่าน provider ปลอมตัวนี้
 */
vi.mock('@/services/tokenProvider', () => ({
  tokenProvider: {
    getToken: () => mocks.session.token,
    onChange: (cb: (t: string | null) => void) => {
      mocks.tokenListeners.add(cb);
      return () => mocks.tokenListeners.delete(cb);
    },
  },
  getTokenSource: () => (mocks.session.token ? 'manual' : 'none'),
  setManualToken: () => undefined,
  startTokenProvider: () => undefined,
  resetTokenProviderForTest: () => undefined,
  requestTokenRefresh: () => {
    mocks.refreshCalls.n += 1;
    return Promise.resolve(mocks.refreshCalls.willSucceed);
  },
}));

vi.mock('@/services/telemetrySocket', () => ({
  telemetryUrl: (u: string) => u + '/telemetry',
  openTelemetrySocket: (opts: Record<string, unknown>) => {
    const h = opts['handlers'] as Record<string, ((e: unknown) => void) | undefined>;
    mocks.handlers.current = h;
    const entry = { closed: 0, opts };
    mocks.handles.push(entry);
    return {
      close: () => {
        entry.closed += 1;
      },
      resubscribe: () => undefined,
      socket: {} as never,
    };
  },
}));

const LIVE_CFG = {
  wsUrl: 'https://api.example.com',
  deviceId: 'dev-1',
  orgId: 'org-1',
};

/** เก็บผลล่าสุดของ hook ออกมาตรวจ โดยไม่ต้องมี UI จริง */
function renderHook(props: Parameters<typeof useTelemetry>[0]) {
  const seen: { current: UseTelemetryResult | null } = { current: null };
  function Probe(p: { readonly o: Parameters<typeof useTelemetry>[0] }) {
    seen.current = useTelemetry(p.o);
    return null;
  }
  const view = render(<Probe o={props} />);
  return { seen, view };
}

beforeEach(() => {
  mocks.config.value = null;
  mocks.session.token = null;
  mocks.tokenListeners.clear();
  mocks.handles.length = 0;
  mocks.handlers.current = {};
  mocks.refreshCalls.n = 0;
  mocks.refreshCalls.willSucceed = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTelemetry', () => {
  it('env ยังไม่ครบ → ไม่เปิด socket และคืนสถานะ mock', () => {
    const { seen } = renderHook({ keys: ['temperature'] });

    expect(mocks.handles).toHaveLength(0);
    expect(seen.current?.connectionStatus).toBe('mock');
    expect(seen.current?.live).toEqual({});
    expect(seen.current?.errorMessage).toBeNull();
  });

  it('ตั้ง env ครบแล้วแต่ยังไม่มี token → ยังไม่เปิด socket', () => {
    mocks.config.value = LIVE_CFG;
    const { seen } = renderHook({ keys: ['temperature'] });

    expect(mocks.handles).toHaveLength(0);
    expect(seen.current?.connectionStatus).toBe('mock');
  });

  it('ครบทั้ง env และ token → เปิด socket พร้อม deviceId/orgId จาก config', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt-123';
    const { seen } = renderHook({ keys: ['temperature', 'humidity'] });

    expect(mocks.handles).toHaveLength(1);
    const opts = mocks.handles[0]!.opts;
    expect(opts['wsUrl']).toBe('https://api.example.com');
    // ไม่ส่ง token เป็นค่าตรงๆ — service ดึงจาก `tokenProvider` เอง แล้วต่อใหม่เมื่อ token เปลี่ยน
    expect(opts['token']).toBeUndefined();
    expect(opts['telemetry']).toMatchObject({
      deviceId: 'dev-1',
      orgId: 'org-1',
      keys: ['temperature', 'humidity'],
    });
    expect(seen.current?.connectionStatus).toBe('connecting');
  });

  it('ไม่ส่ง history ถ้าไม่ได้ขอ · ส่งช่วงเวลาให้ถ้าขอ', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';

    renderHook({ keys: ['temperature'] });
    expect(
      (mocks.handles[0]!.opts['telemetry'] as Record<string, unknown>)['history'],
    ).toBeUndefined();

    mocks.handles.length = 0;
    renderHook({ keys: ['temperature'], historyMs: 3_600_000, historyLimit: 100 });
    const hist = (mocks.handles[0]!.opts['telemetry'] as Record<string, unknown>)['history'] as {
      keys: string[];
      startTs: number;
      endTs: number;
      limit: number;
    };
    expect(hist.keys).toEqual(['temperature']);
    expect(hist.limit).toBe(100);
    expect(hist.endTs - hist.startTs).toBe(3_600_000);
  });

  it('ส่ง attributeKeys + scope เมื่อขอ attribute', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';
    renderHook({
      keys: ['temperature'],
      attributeKeys: ['relay_1'],
      attributeScope: 'SHARED_SCOPE',
    });

    expect(mocks.handles[0]!.opts['telemetry']).toMatchObject({
      attributeKeys: ['relay_1'],
      attributeScope: 'SHARED_SCOPE',
    });
  });

  it('connected → live · ได้ telemetry_data แล้วเก็บค่าและจับเวลาอัปเดต', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';
    const { seen } = renderHook({ keys: ['temperature'] });

    act(() => mocks.handlers.current['onConnected']?.({ message: 'ok' }));
    expect(seen.current?.connectionStatus).toBe('live');
    expect(seen.current?.lastUpdateAt).toBeNull();

    act(() =>
      mocks.handlers.current['onTelemetry']?.({
        deviceId: 'dev-1',
        timestamp: 1,
        data: { temperature: { value: '25.4', timestamp: 1 } },
      }),
    );
    expect(seen.current?.live['temperature']?.value).toBe('25.4');
    expect(seen.current?.lastUpdateAt).not.toBeNull();
  });

  it('history_data ถูกเก็บแยกจาก live', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';
    const { seen } = renderHook({ keys: ['temperature'], historyMs: 1000 });

    act(() =>
      mocks.handlers.current['onHistory']?.({
        deviceId: 'dev-1',
        timestamp: 2,
        data: { temperature: [{ ts: 1, value: '24.8' }] },
      }),
    );

    expect(seen.current?.history['temperature']).toHaveLength(1);
    expect(seen.current?.live).toEqual({});
  });

  it('attribute_data เก็บแยก ใช้เป็นสถานะ relay ได้', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';
    const { seen } = renderHook({ keys: ['t'], attributeKeys: ['relay_1'] });

    act(() =>
      mocks.handlers.current['onAttribute']?.({
        deviceId: 'dev-1',
        scope: 'CLIENT_SCOPE',
        timestamp: 3,
        data: { relay_1: { value: 'true', timestamp: 3 } },
      }),
    );

    expect(seen.current?.attributes['relay_1']?.value).toBe('true');
  });

  it('error → offline + มีข้อความบอก ไม่ปล่อย error ดิบ', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';
    const { seen } = renderHook({ keys: ['t'] });

    act(() => mocks.handlers.current['onError']?.({ message: 'Access denied' }));

    expect(seen.current?.connectionStatus).toBe('offline');
    expect(seen.current?.errorMessage).toBe('Access denied');
  });

  it('TOKEN_EXPIRED ไม่เปลี่ยนสถานะและไม่โชว์ error (service retry ให้แล้ว)', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';
    const { seen } = renderHook({ keys: ['t'] });
    act(() => mocks.handlers.current['onConnected']?.({ message: 'ok' }));

    act(() =>
      mocks.handlers.current['onSubscriptionError']?.({
        deviceId: 'dev-1',
        type: 'TOKEN_EXPIRED',
        message: 'expired',
        retryable: true,
      }),
    );

    expect(seen.current?.connectionStatus).toBe('live');
    expect(seen.current?.errorMessage).toBeNull();
  });

  it('disconnect ที่ต่อกลับได้ → reconnecting', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';
    const { seen } = renderHook({ keys: ['t'] });
    act(() => mocks.handlers.current['onConnected']?.({ message: 'ok' }));
    act(() => mocks.handlers.current['onDisconnect']?.('transport close'));

    expect(seen.current?.connectionStatus).toBe('reconnecting');
  });

  /**
   * ลำดับที่ server จริงทำตอน token ใช้ไม่ได้ (ตรวจมาแล้ว):
   * `connect` → `error: Invalid authentication token` → `disconnect: io server disconnect`
   *
   * socket.io **ไม่ต่อกลับเอง** เมื่อ server เป็นฝ่ายตัด ถ้า `disconnect` ทับสถานะเป็น
   * "กำลังเชื่อมต่อใหม่…" ผู้ใช้จะรอเก้อตลอดกาลทั้งที่ไม่มีใครพยายามต่ออีกแล้ว
   */
  it('error แล้ว server ตัด → ต้องคง offline ไม่ใช่บอกว่ากำลังต่อใหม่', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'bad-jwt';
    const { seen } = renderHook({ keys: ['t'] });

    act(() => mocks.handlers.current['onError']?.({ message: 'Invalid authentication token' }));
    act(() => mocks.handlers.current['onDisconnect']?.('io server disconnect'));

    expect(seen.current?.connectionStatus).toBe('offline');
    expect(seen.current?.errorMessage).toBe('Invalid authentication token');
  });

  /**
   * token หมดอายุระหว่างเปิดเว็บค้างไว้ = อาการ "ล็อกอินอยู่แต่ขาดการเชื่อมต่อ"
   * ต้องสั่งต่ออายุ token อัตโนมัติ ไม่ใช่ค้าง offline ให้ผู้ใช้ล็อกอินใหม่เอง
   */
  it('เจอ Invalid authentication token → สั่งต่ออายุ token อัตโนมัติ', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'expired-jwt';
    renderHook({});

    act(() => mocks.handlers.current['onError']?.({ message: 'Invalid authentication token' }));

    expect(mocks.refreshCalls.n).toBe(1);
  });

  it('ต่ออายุแล้วยังโดนปฏิเสธซ้ำๆ → หยุดที่ MAX_AUTH_RETRIES ไม่วนไม่รู้จบ', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'bad-jwt';
    mocks.refreshCalls.willSucceed = false;
    renderHook({});

    // ยิง error ซ้ำ 5 ครั้ง — ต้องต่ออายุแค่ 2 ครั้ง (MAX_AUTH_RETRIES) แล้วหยุด
    for (let i = 0; i < 5; i += 1) {
      act(() => mocks.handlers.current['onError']?.({ message: 'Invalid authentication token' }));
    }

    expect(mocks.refreshCalls.n).toBe(2);
  });

  it('ต่อติดสำเร็จแล้วรีเซ็ตตัวนับ — token หมดอายุรอบใหม่ต่ออายุได้อีก', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';
    renderHook({});

    act(() => mocks.handlers.current['onConnected']?.({ message: 'ok' }));
    act(() => mocks.handlers.current['onError']?.({ message: 'Invalid authentication token' }));
    expect(mocks.refreshCalls.n).toBe(1);

    act(() => mocks.handlers.current['onConnected']?.({ message: 'ok' }));
    act(() => mocks.handlers.current['onError']?.({ message: 'Invalid authentication token' }));
    expect(mocks.refreshCalls.n).toBe(2);
  });

  it('server ตัดเองแม้ไม่มี error นำหน้า ก็ยังไม่ใช่ "กำลังต่อใหม่"', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';
    const { seen } = renderHook({ keys: ['t'] });
    act(() => mocks.handlers.current['onConnected']?.({ message: 'ok' }));
    act(() => mocks.handlers.current['onDisconnect']?.('io server disconnect'));

    expect(seen.current?.connectionStatus).toBe('offline');
  });

  /**
   * โหมดค้นหา — เอกสารบอกว่า "ไม่ส่ง `keys` = รับทุก key ที่ device ยิงมา"
   * ต้องไม่ใส่ field `keys` เลย ส่ง array ว่างไปคือ "ไม่ขอ key อะไรเลย" ซึ่งได้จอว่าง
   */
  it('ไม่ส่ง keys → คำขอต้องไม่มี field keys เลย (ขอทุก key ที่ device ยิงมา)', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';
    renderHook({});

    const req = mocks.handles[0]!.opts['telemetry'] as Record<string, unknown>;
    expect(req).toEqual({ deviceId: 'dev-1', orgId: 'org-1' });
    expect('keys' in req).toBe(false);
  });

  it('ส่ง keys เป็น array ว่าง ก็ถือว่าไม่ระบุ — ไม่ให้ยิงคำขอที่ขออะไรเลยไม่ได้', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';
    renderHook({ keys: [] });

    expect(mocks.handles[0]!.opts['telemetry']).toEqual({ deviceId: 'dev-1', orgId: 'org-1' });
  });

  /** เอกสารเตือนไว้ชัด — ลืม cleanup แล้ว backend จะเปิด WS ไป TB ค้างไว้ */
  it('unmount → close() ถูกเรียก (unsubscribe + disconnect)', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';
    const { view } = renderHook({ keys: ['temperature'] });

    expect(mocks.handles[0]!.closed).toBe(0);
    view.unmount();
    expect(mocks.handles[0]!.closed).toBe(1);
  });

  /**
   * `keys` เป็น array ที่หน้าเพจมักสร้างใหม่ทุก render
   * ถ้า effect ผูกกับ reference ของ array socket จะถูกปิด-เปิดใหม่ทุกครั้งที่ parent re-render
   * = ถล่ม backend ฟรีๆ hook จึงเทียบด้วยเนื้อหา (`keys.join(',')`) ไม่ใช่ reference
   */
  it('parent re-render แล้วสร้าง keys array ใหม่ — ต้องไม่เปิด socket ใหม่', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';

    // ต้องเป็น component **ชนิดเดียวกัน** ไม่งั้น React unmount/mount ใหม่เอง (ไม่ได้ทดสอบ hook)
    function Probe({ tick }: { readonly tick: number }) {
      // สร้าง array ใหม่ทุก render โดยตั้งใจ · `tick` แค่บังคับให้ re-render
      useTelemetry({ keys: ['temperature'], historyLimit: 100 });
      return <span>{tick}</span>;
    }

    const view = render(<Probe tick={1} />);
    expect(mocks.handles).toHaveLength(1);

    view.rerender(<Probe tick={2} />);
    view.rerender(<Probe tick={3} />);

    expect(mocks.handles).toHaveLength(1);
    expect(mocks.handles[0]!.closed).toBe(0);
  });

  it('keys เปลี่ยนจริง → ปิดตัวเก่าแล้วเปิดใหม่', () => {
    mocks.config.value = LIVE_CFG;
    mocks.session.token = 'jwt';

    function Probe({ keys }: { readonly keys: readonly string[] }) {
      useTelemetry({ keys });
      return null;
    }

    const view = render(<Probe keys={['temperature']} />);
    expect(mocks.handles).toHaveLength(1);

    view.rerender(<Probe keys={['temperature', 'humidity']} />);

    expect(mocks.handles).toHaveLength(2);
    expect(mocks.handles[0]!.closed).toBe(1);
  });
});
