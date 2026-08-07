import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WS_EMIT, WS_ON } from '@shared/telemetrySocket';
import { openTelemetrySocket, telemetryUrl } from './telemetrySocket';
import type { TokenProvider } from './tokenProvider';

/**
 * เทสตัวเชื่อม WebSocket โดย mock `socket.io-client`
 *
 * สิ่งที่ต้องคุมให้ได้จริง (จาก `WEBSOCKET_API.md`):
 *   1. subscribe ตอน `connected` **ไม่ใช่** `connect` — ยิงก่อน auth ผ่านจะถูกตัดทิ้ง
 *   2. `TOKEN_EXPIRED` ต้อง subscribe ใหม่เอง ไม่โยน error ให้ผู้ใช้
 *   3. ปิดหน้าต้อง **unsubscribe ก่อน** disconnect ไม่งั้น backend เปิด WS ไป TB ค้างไว้
 */

/** socket ปลอมที่จับ event ที่ยิงออก และให้เราปลุก handler ได้เอง */
const mocks = vi.hoisted(() => {
  interface FakeSocket {
    connected: boolean;
    readonly handlers: Map<string, ((...a: unknown[]) => void)[]>;
    readonly emitted: { event: string; payload: unknown }[];
    readonly on: (e: string, fn: (...a: unknown[]) => void) => FakeSocket;
    readonly emit: (e: string, payload?: unknown) => FakeSocket;
    readonly removeAllListeners: () => FakeSocket;
    readonly disconnect: () => FakeSocket;
    readonly fire: (e: string, payload?: unknown) => void;
    disconnectCalls: number;
    removeAllCalls: number;
  }
  const created: FakeSocket[] = [];
  const urls: string[] = [];

  const makeSocket = (): FakeSocket => {
    const s: FakeSocket = {
      connected: true,
      handlers: new Map(),
      emitted: [],
      disconnectCalls: 0,
      removeAllCalls: 0,
      on(e, fn) {
        const list = s.handlers.get(e) ?? [];
        list.push(fn);
        s.handlers.set(e, list);
        return s;
      },
      emit(e, payload) {
        s.emitted.push({ event: e, payload });
        return s;
      },
      removeAllListeners() {
        s.removeAllCalls += 1;
        s.handlers.clear();
        return s;
      },
      disconnect() {
        s.disconnectCalls += 1;
        s.connected = false;
        return s;
      },
      fire(e, payload) {
        for (const fn of s.handlers.get(e) ?? []) fn(payload);
      },
    };
    return s;
  };

  return { created, urls, makeSocket };
});

vi.mock('socket.io-client', () => ({
  io: (url: string) => {
    mocks.urls.push(url);
    const s = mocks.makeSocket();
    mocks.created.push(s);
    return s;
  },
}));

const TELEMETRY = { deviceId: 'dev-1', orgId: 'org-1', keys: ['temperature'] } as const;
const last = () => mocks.created[mocks.created.length - 1]!;
const emittedNames = () => last().emitted.map((e) => e.event);

/**
 * `TokenProvider` ปลอมที่เราสั่งเปลี่ยน token ได้
 * service ไม่รับ token เป็นค่าตรงๆ เพราะ token เปลี่ยนได้ระหว่างทาง (parent ส่งตัวใหม่ / dev แปะใหม่)
 */
let currentToken: string | null = 't';
const tokenListeners = new Set<(t: string | null) => void>();
const fakeTokens: TokenProvider = {
  getToken: () => currentToken,
  onChange(cb) {
    tokenListeners.add(cb);
    return () => {
      tokenListeners.delete(cb);
    };
  },
};
const changeToken = (next: string | null): void => {
  currentToken = next;
  for (const cb of tokenListeners) cb(next);
};

beforeEach(() => {
  mocks.created.length = 0;
  mocks.urls.length = 0;
  currentToken = 't';
  tokenListeners.clear();
});

describe('telemetryUrl', () => {
  it('ต่อ namespace /telemetry ให้เอง', () => {
    expect(telemetryUrl('https://api.example.com')).toBe('https://api.example.com/telemetry');
  });

  it('ตัด / ท้ายก่อนต่อ ไม่ให้ได้ //telemetry', () => {
    expect(telemetryUrl('https://api.example.com/')).toBe('https://api.example.com/telemetry');
  });

  /** เคยตั้ง env มาแล้วมี /telemetry ติดมาด้วย — ต้องไม่ได้ /telemetry/telemetry */
  it('ถ้ามี /telemetry ติดมาแล้วไม่เติมซ้ำ', () => {
    expect(telemetryUrl('https://api.example.com/telemetry')).toBe(
      'https://api.example.com/telemetry',
    );
  });
});

describe('openTelemetrySocket', () => {
  it('ต่อไปที่ namespace /telemetry', () => {
    openTelemetrySocket({
      wsUrl: 'https://api.example.com',
      tokens: fakeTokens,
      telemetry: TELEMETRY,
    });
    expect(mocks.urls).toEqual(['https://api.example.com/telemetry']);
  });

  /** ข้อ 1 — ยิง subscribe ก่อน auth ผ่านจะถูก server ตัดทิ้ง */
  it('ยัง**ไม่** subscribe ตอน connect — รอ connected ก่อน', () => {
    openTelemetrySocket({ wsUrl: 'https://x.dev', tokens: fakeTokens, telemetry: TELEMETRY });

    last().fire(WS_ON.connect);
    expect(emittedNames()).not.toContain(WS_EMIT.subscribeTelemetry);

    last().fire(WS_ON.connected, { message: 'ok' });
    expect(emittedNames()).toContain(WS_EMIT.subscribeTelemetry);
    expect(last().emitted[0]?.payload).toEqual(TELEMETRY);
  });

  it('subscribe alarm ด้วยถ้าส่ง alarm มา', () => {
    const alarm = { deviceId: 'dev-1', orgId: 'org-1', pageSize: 10 } as const;
    openTelemetrySocket({
      wsUrl: 'https://x.dev',
      tokens: fakeTokens,
      telemetry: TELEMETRY,
      alarm,
    });
    last().fire(WS_ON.connected, { message: 'ok' });

    expect(emittedNames()).toEqual([WS_EMIT.subscribeTelemetry, WS_EMIT.subscribeAlarm]);
  });

  /** ข้อ 2 — เอกสารบอกว่า TOKEN_EXPIRED ให้ subscribe ใหม่ ระบบ refresh ให้เอง */
  it('subscription_error TOKEN_EXPIRED → subscribe ใหม่อัตโนมัติ', () => {
    const onSubscriptionError = vi.fn();
    openTelemetrySocket({
      wsUrl: 'https://x.dev',
      tokens: fakeTokens,
      telemetry: TELEMETRY,
      handlers: { onSubscriptionError },
    });
    last().fire(WS_ON.connected, { message: 'ok' });
    expect(emittedNames().filter((e) => e === WS_EMIT.subscribeTelemetry)).toHaveLength(1);

    last().fire(WS_ON.subscriptionError, {
      deviceId: 'dev-1',
      type: 'TOKEN_EXPIRED',
      message: 'expired',
      retryable: true,
    });

    expect(emittedNames().filter((e) => e === WS_EMIT.subscribeTelemetry)).toHaveLength(2);
    expect(onSubscriptionError).toHaveBeenCalledOnce();
  });

  it('subscription_error ชนิดอื่นไม่ subscribe ซ้ำ แต่ยังบอกผู้เรียก', () => {
    const onSubscriptionError = vi.fn();
    openTelemetrySocket({
      wsUrl: 'https://x.dev',
      tokens: fakeTokens,
      telemetry: TELEMETRY,
      handlers: { onSubscriptionError },
    });
    last().fire(WS_ON.connected, { message: 'ok' });
    last().fire(WS_ON.subscriptionError, {
      deviceId: 'dev-1',
      type: 'CONNECTION_ERROR',
      message: 'tb down',
      retryable: true,
    });

    expect(emittedNames().filter((e) => e === WS_EMIT.subscribeTelemetry)).toHaveLength(1);
    expect(onSubscriptionError).toHaveBeenCalledOnce();
  });

  it('ส่ง telemetry_data / attribute_data / history_data ต่อให้ผู้เรียก', () => {
    const onTelemetry = vi.fn();
    const onAttribute = vi.fn();
    const onHistory = vi.fn();
    openTelemetrySocket({
      wsUrl: 'https://x.dev',
      tokens: fakeTokens,
      telemetry: TELEMETRY,
      handlers: { onTelemetry, onAttribute, onHistory },
    });

    last().fire(WS_ON.telemetryData, { deviceId: 'dev-1', timestamp: 1, data: {} });
    last().fire(WS_ON.attributeData, {
      deviceId: 'dev-1',
      scope: 'CLIENT_SCOPE',
      timestamp: 1,
      data: {},
    });
    last().fire(WS_ON.historyData, { deviceId: 'dev-1', timestamp: 1, data: {} });

    expect(onTelemetry).toHaveBeenCalledOnce();
    expect(onAttribute).toHaveBeenCalledOnce();
    expect(onHistory).toHaveBeenCalledOnce();
  });

  /** ข้อ 3 — ลำดับสำคัญ: unsubscribe ต้องมาก่อน disconnect */
  it('close(): unsubscribe ก่อน แล้วจึง removeAllListeners + disconnect', () => {
    const alarm = { deviceId: 'dev-1', orgId: 'org-1' } as const;
    const handle = openTelemetrySocket({
      wsUrl: 'https://x.dev',
      tokens: fakeTokens,
      telemetry: TELEMETRY,
      alarm,
    });
    last().fire(WS_ON.connected, { message: 'ok' });

    handle.close();

    expect(emittedNames()).toEqual([
      WS_EMIT.subscribeTelemetry,
      WS_EMIT.subscribeAlarm,
      WS_EMIT.unsubscribeTelemetry,
      WS_EMIT.unsubscribeAlarm,
    ]);
    expect(last().emitted[2]?.payload).toEqual({ deviceId: 'dev-1' });
    expect(last().removeAllCalls).toBe(1);
    expect(last().disconnectCalls).toBe(1);
  });

  it('close() ซ้ำสองครั้งไม่ยิง unsubscribe ซ้ำ', () => {
    const handle = openTelemetrySocket({
      wsUrl: 'https://x.dev',
      tokens: fakeTokens,
      telemetry: TELEMETRY,
    });
    last().fire(WS_ON.connected, { message: 'ok' });

    handle.close();
    handle.close();

    expect(emittedNames().filter((e) => e === WS_EMIT.unsubscribeTelemetry)).toHaveLength(1);
    expect(last().disconnectCalls).toBe(1);
  });

  it('ต่อไม่ติดแล้วปิด — ไม่ยิง unsubscribe แต่ยัง disconnect', () => {
    const handle = openTelemetrySocket({
      wsUrl: 'https://x.dev',
      tokens: fakeTokens,
      telemetry: TELEMETRY,
    });
    last().connected = false;

    handle.close();

    expect(emittedNames()).not.toContain(WS_EMIT.unsubscribeTelemetry);
    expect(last().disconnectCalls).toBe(1);
  });

  it('close() แล้ว TOKEN_EXPIRED ที่มาช้าไม่ทำให้ subscribe ใหม่', () => {
    const handle = openTelemetrySocket({
      wsUrl: 'https://x.dev',
      tokens: fakeTokens,
      telemetry: TELEMETRY,
    });
    const s = last();
    s.fire(WS_ON.connected, { message: 'ok' });
    // เก็บ handler ไว้ก่อน close เพราะ close จะถอด listener ทิ้ง
    const onSubErr = s.handlers.get(WS_ON.subscriptionError)?.[0];
    handle.close();
    onSubErr?.({ deviceId: 'dev-1', type: 'TOKEN_EXPIRED', message: '', retryable: true });

    expect(s.emitted.filter((e) => e.event === WS_EMIT.subscribeTelemetry)).toHaveLength(1);
  });
});

/**
 * `auth` ถูกส่งตอน handshake เท่านั้น — token เปลี่ยนแล้วต้อง **ต่อใหม่**
 * ไม่ใช่แค่ subscribe ใหม่ ไม่งั้น socket ตัวเดิมยังถือ token เก่าที่หมดอายุอยู่
 */
describe('token เปลี่ยน', () => {
  it('ยังไม่มี token → ไม่เปิด socket เลย', () => {
    currentToken = null;
    const handle = openTelemetrySocket({
      wsUrl: 'https://x.dev',
      tokens: fakeTokens,
      telemetry: TELEMETRY,
    });

    expect(mocks.created).toHaveLength(0);
    expect(handle.socket()).toBeNull();
  });

  it('token มาถึงทีหลัง → เปิด socket ตอนนั้น', () => {
    currentToken = null;
    openTelemetrySocket({ wsUrl: 'https://x.dev', tokens: fakeTokens, telemetry: TELEMETRY });
    expect(mocks.created).toHaveLength(0);

    changeToken('fresh');

    expect(mocks.created).toHaveLength(1);
    last().fire(WS_ON.connected, { message: 'ok' });
    expect(emittedNames()).toContain(WS_EMIT.subscribeTelemetry);
  });

  it('เปลี่ยนตัวใหม่ → ปิดตัวเก่า (unsubscribe ก่อน) แล้วเปิดตัวใหม่', () => {
    openTelemetrySocket({ wsUrl: 'https://x.dev', tokens: fakeTokens, telemetry: TELEMETRY });
    const old = last();
    old.fire(WS_ON.connected, { message: 'ok' });

    changeToken('token-2');

    expect(mocks.created).toHaveLength(2);
    expect(old.emitted.map((e) => e.event)).toContain(WS_EMIT.unsubscribeTelemetry);
    expect(old.disconnectCalls).toBe(1);
    expect(last()).not.toBe(old);
  });

  it('token ถูกล้าง (logout) → ปิด socket และแจ้ง disconnect ไม่เปิดใหม่', () => {
    const onDisconnect = vi.fn();
    openTelemetrySocket({
      wsUrl: 'https://x.dev',
      tokens: fakeTokens,
      telemetry: TELEMETRY,
      handlers: { onDisconnect },
    });
    const old = last();
    old.fire(WS_ON.connected, { message: 'ok' });

    changeToken(null);

    expect(mocks.created).toHaveLength(1);
    expect(old.disconnectCalls).toBe(1);
    expect(onDisconnect).toHaveBeenCalledWith('token cleared');
  });

  it('close() แล้วเลิกฟัง token — เปลี่ยน token ทีหลังไม่เปิด socket ใหม่', () => {
    const handle = openTelemetrySocket({
      wsUrl: 'https://x.dev',
      tokens: fakeTokens,
      telemetry: TELEMETRY,
    });
    handle.close();

    changeToken('token-9');

    expect(mocks.created).toHaveLength(1);
  });
});
