import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import {
  TELEMETRY_NAMESPACE,
  WS_EMIT,
  WS_ON,
  type AlarmDataEvent,
  type AlarmUpdateEvent,
  type AttributeDataEvent,
  type ConnectedEvent,
  type HistoryDataEvent,
  type SocketErrorEvent,
  type SubscribeAlarmRequest,
  type SubscribeTelemetryRequest,
  type SubscribedEvent,
  type SubscriptionErrorEvent,
  type TelemetryDataEvent,
} from '@shared/telemetrySocket';
import { tokenProvider } from './tokenProvider';
import type { TokenProvider } from './tokenProvider';

/**
 * ตัวเชื่อม WebSocket ไป backend ของทีม — ทำตาม `WEBSOCKET_API.md` เท่านั้น
 *
 * ที่ห่อไว้เป็นชั้นนี้เพราะ:
 *   1. `socket.io-client` คืน `any` เยอะ ต้องบีบเป็น type ของ `@shared/telemetrySocket` ที่จุดเดียว
 *   2. ต้อง **รอ `connected` ก่อนถึงจะ subscribe ได้** (ไม่ใช่ `connect`) พลาดง่ายมาก
 *   3. `TOKEN_EXPIRED` ต้อง subscribe ใหม่อัตโนมัติ ไม่ปล่อยให้หน้าเพจจัดการเอง
 */

export interface TelemetrySocketHandlers {
  readonly onConnected?: (e: ConnectedEvent) => void;
  readonly onSubscribed?: (e: SubscribedEvent) => void;
  readonly onTelemetry?: (e: TelemetryDataEvent) => void;
  readonly onAttribute?: (e: AttributeDataEvent) => void;
  readonly onHistory?: (e: HistoryDataEvent) => void;
  readonly onAlarmData?: (e: AlarmDataEvent) => void;
  readonly onAlarmUpdate?: (e: AlarmUpdateEvent) => void;
  /** ปัญหาหลัง subscribe แล้ว — `TOKEN_EXPIRED` ถูก retry ให้แล้วก่อนเรียกตัวนี้ */
  readonly onSubscriptionError?: (e: SubscriptionErrorEvent) => void;
  /** auth/validation ผิด — หลังจากนี้ server จะตัดการเชื่อมต่อ */
  readonly onError?: (e: SocketErrorEvent) => void;
  readonly onDisconnect?: (reason: string) => void;
}

export interface TelemetrySocketOptions {
  /** origin ของ backend — **ไม่รวม** namespace โค้ดต่อ `/telemetry` ให้เอง */
  readonly wsUrl: string;
  /**
   * ที่มาของ token — **ไม่รับ token เป็นค่าตรงๆ** เพราะ token เปลี่ยนได้ระหว่างทาง
   * (parent ส่งตัวใหม่มาแทน / dev แปะตัวใหม่) ถ้ารับเป็นค่านิ่งจะได้ socket ที่ถือ token ตายแล้ว
   * ดีฟอลต์เป็น singleton ของแอป · เทสส่งตัวปลอมเข้ามาแทนได้
   */
  readonly tokens?: TokenProvider;
  /** สิ่งที่จะ subscribe ทันทีเมื่อ `connected` มาถึง */
  readonly telemetry?: SubscribeTelemetryRequest;
  readonly alarm?: SubscribeAlarmRequest;
  readonly handlers?: TelemetrySocketHandlers;
}

export interface TelemetrySocketHandle {
  /** ปิดทุกอย่าง: unsubscribe → ถอด listener → disconnect (เรียกได้ซ้ำ ไม่พัง) */
  readonly close: () => void;
  /** subscribe ใหม่ด้วยคำขอเดิม — ใช้เองได้ นอกจากที่ `TOKEN_EXPIRED` เรียกให้อัตโนมัติ */
  readonly resubscribe: () => void;
  /** socket ที่ใช้อยู่ตอนนี้ — `null` เมื่อยังไม่มี token · เปลี่ยนตัวใหม่เมื่อ token เปลี่ยน */
  readonly socket: () => Socket | null;
}

/**
 * `io()` รับ namespace ต่อท้าย origin ได้ตรงๆ — `/telemetry` เป็น namespace ไม่ใช่ HTTP path
 * (ตรวจกับ server จริงแล้ว: path ของ Socket.IO เป็นค่าดีฟอลต์ `/socket.io/` ไม่ต้องตั้งเอง)
 * ตัด `/` ท้ายและ `/telemetry` ที่อาจถูกใส่มาเกิน กันตั้ง env มาแล้วต่อได้ `//telemetry/telemetry`
 */
export function telemetryUrl(wsUrl: string): string {
  const origin = wsUrl.replace(/\/+$/, '').replace(/\/telemetry$/, '');
  return origin + TELEMETRY_NAMESPACE;
}

export function openTelemetrySocket(opts: TelemetrySocketOptions): TelemetrySocketHandle {
  const h = opts.handlers ?? {};
  const tokens = opts.tokens ?? tokenProvider;
  const url = telemetryUrl(opts.wsUrl);

  let socket: Socket | null = null;
  let closed = false;

  const subscribe = (): void => {
    if (closed || !socket) return;
    if (opts.telemetry) socket.emit(WS_EMIT.subscribeTelemetry, opts.telemetry);
    if (opts.alarm) socket.emit(WS_EMIT.subscribeAlarm, opts.alarm);
  };

  /** ปิด socket ตัวปัจจุบัน — unsubscribe ก่อนเสมอ ไม่งั้น backend เปิด WS ไป TB ค้างไว้ */
  const teardown = (): void => {
    if (!socket) return;
    if (socket.connected) {
      if (opts.telemetry)
        socket.emit(WS_EMIT.unsubscribeTelemetry, { deviceId: opts.telemetry.deviceId });
      if (opts.alarm) socket.emit(WS_EMIT.unsubscribeAlarm, { deviceId: opts.alarm.deviceId });
    }
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  };

  const connect = (token: string): void => {
    socket = io(url, { auth: { token }, transports: ['websocket', 'polling'] });

    /**
     * ⚠️ subscribe ตอน `connected` ไม่ใช่ `connect`
     * `connect` = socket ต่อติดระดับ socket.io · `connected` = server ยืนยันว่า auth ผ่าน
     * ยิง subscribe ก่อน auth ผ่านจะได้ `error` แล้วถูกตัดทิ้ง
     */
    socket.on(WS_ON.connected, (e: ConnectedEvent) => {
      h.onConnected?.(e);
      subscribe();
    });

    if (h.onSubscribed) socket.on(WS_ON.subscribed, h.onSubscribed);
    if (h.onTelemetry) socket.on(WS_ON.telemetryData, h.onTelemetry);
    if (h.onAttribute) socket.on(WS_ON.attributeData, h.onAttribute);
    if (h.onHistory) socket.on(WS_ON.historyData, h.onHistory);
    if (h.onAlarmData) socket.on(WS_ON.alarmData, h.onAlarmData);
    if (h.onAlarmUpdate) socket.on(WS_ON.alarmUpdate, h.onAlarmUpdate);
    if (h.onError) socket.on(WS_ON.error, h.onError);
    if (h.onDisconnect) socket.on(WS_ON.disconnect, h.onDisconnect);

    /**
     * `TOKEN_EXPIRED` คือ token ของ service account ฝั่ง backend หมดอายุ ไม่ใช่ token ของเรา
     * เอกสารบอกว่า "แค่ subscribe ใหม่ ระบบ refresh ให้อัตโนมัติ" — จัดการเองที่นี่
     * ไม่โยน error ดิบให้ผู้ใช้เห็น
     */
    socket.on(WS_ON.subscriptionError, (e: SubscriptionErrorEvent) => {
      if (e.type === 'TOKEN_EXPIRED') subscribe();
      h.onSubscriptionError?.(e);
    });
  };

  const first = tokens.getToken();
  if (first !== null) connect(first);

  /**
   * token เปลี่ยน = ต้องต่อใหม่ ไม่ใช่แค่ subscribe ใหม่
   * `auth` ถูกส่งตอน handshake เท่านั้น socket ตัวเดิมจะยังถือ token เก่าอยู่
   */
  const stopWatching = tokens.onChange((next) => {
    if (closed) return;
    teardown();
    if (next !== null) connect(next);
    else h.onDisconnect?.('token cleared');
  });

  const close = (): void => {
    if (closed) return;
    closed = true;
    stopWatching();
    teardown();
  };

  return { close, resubscribe: subscribe, socket: () => socket };
}
