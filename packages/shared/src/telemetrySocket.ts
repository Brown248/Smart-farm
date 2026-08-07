/**
 * สัญญาของ WebSocket ที่ backend ของทีมเปิดให้ (namespace `/telemetry`)
 *
 * ถอดตรงจาก `WEBSOCKET_API.md` — **ห้ามเดา field หรือชื่อ event เอง**
 * ถ้าเอกสารขัดกับที่เขียนไว้ที่นี่ ให้ยึดเอกสารแล้วแก้ไฟล์นี้ตาม
 *
 * ⚠️ ค่าที่ได้กลับมาเป็น **string ทุกตัว** ตามตัวอย่างในเอกสาร (`"25.4"` · `"true"`)
 * ไม่ใช่ number/boolean — ต้องแปลงก่อนใช้ (`telemetryNumber` / `telemetryBoolean` ท้ายไฟล์)
 */

/* ══════════════════════════ ฝั่งส่งไป (client → server) ══════════════════════════ */

/** ขอบเขตของ attribute ใน ThingsBoard — ดีฟอลต์ของ backend คือ `CLIENT_SCOPE` */
export const ATTRIBUTE_SCOPES = ['CLIENT_SCOPE', 'SHARED_SCOPE', 'SERVER_SCOPE'] as const;
export type AttributeScope = (typeof ATTRIBUTE_SCOPES)[number];

/** วิธีรวมข้อมูลของ history — มีผลเมื่อใส่ `interval` เท่านั้น */
export const HISTORY_AGGS = ['NONE', 'AVG', 'SUM', 'MAX', 'MIN'] as const;
export type HistoryAgg = (typeof HISTORY_AGGS)[number];

/**
 * ขอ history ย้อนหลัง — **ดึงครั้งเดียว ไม่ใช่ subscription**
 * ส่งมาพร้อม `subscribe_telemetry` แล้วได้ `history_data` กลับมาหนึ่งครั้ง จบ
 */
export interface HistoryRequest {
  readonly keys: readonly string[];
  /** ms epoch */
  readonly startTs: number;
  readonly endTs: number;
  /** ms · 0 หรือไม่ส่ง = เอาจุดดิบ · ใส่ค่าเพื่อรวมเป็น bucket */
  readonly interval?: number;
  readonly agg?: HistoryAgg;
  readonly limit?: number;
}

/**
 * `subscribe_telemetry` — ยิงครั้งเดียวได้ทั้ง telemetry สด + attribute สด + history
 * field ไหนไม่ต้องการก็ไม่ต้องส่ง
 *
 * ⚠️ 1 socket subscribe ได้ **1 device ต่อครั้ง** หลาย device ต้องยิงแยกกัน
 */
export interface SubscribeTelemetryRequest {
  /** UUID ของ device ในระบบของทีม — **ไม่ใช่** `tbDeviceId` ของ ThingsBoard */
  readonly deviceId: string;
  readonly orgId: string;
  /** ไม่ส่ง = รับทุก key ที่ device ยิงมา */
  readonly keys?: readonly string[];
  /** ไม่ส่ง = ไม่ subscribe attribute เลย */
  readonly attributeKeys?: readonly string[];
  readonly attributeScope?: AttributeScope;
  readonly history?: HistoryRequest;
}

/** ระดับความรุนแรงของ alarm ใน ThingsBoard */
export const ALARM_SEVERITIES = ['CRITICAL', 'MAJOR', 'MINOR', 'WARNING', 'INDETERMINATE'] as const;
export type AlarmSeverity = (typeof ALARM_SEVERITIES)[number];

export const ALARM_STATUSES = [
  'ACTIVE_UNACK',
  'ACTIVE_ACK',
  'CLEARED_UNACK',
  'CLEARED_ACK',
] as const;
export type AlarmStatus = (typeof ALARM_STATUSES)[number];

/** `subscribe_alarm` — ไม่ส่ง filter = รับทุกอัน · `pageSize` ดีฟอลต์ 10 สูงสุด 100 */
export interface SubscribeAlarmRequest {
  readonly deviceId: string;
  readonly orgId: string;
  readonly pageSize?: number;
  readonly severities?: readonly AlarmSeverity[];
  readonly statuses?: readonly AlarmStatus[];
}

/** payload ของทั้ง `unsubscribe_telemetry` และ `unsubscribe_alarm` */
export interface UnsubscribeRequest {
  readonly deviceId: string;
}

/* ══════════════════════════ ฝั่งรับกลับ (server → client) ══════════════════════════ */

/** ค่าหนึ่งค่าจาก telemetry/attribute — `value` เป็น string ตามเอกสาร */
export interface TelemetryValue {
  /**
   * **`null` ได้** — ยืนยันกับ server จริงแล้ว: ขอ key ที่ device ไม่มี จะได้ key นั้นกลับมา
   * พร้อม `value: null` **ไม่ใช่ไม่ส่งมาเลย** และไม่ใช่ error
   *
   * เดิมประกาศเป็น `string` เฉยๆ ทำให้ `telemetryNumber()` เรียก `null.trim()` แล้ว throw
   * ทั้ง `FarmStateProvider` — จอขาวทันทีที่ device ส่ง key ที่ยังไม่มีค่า
   */
  readonly value: string | null;
  readonly timestamp: number;
}

/** จุดหนึ่งจุดของ history — ใช้ `ts` ไม่ใช่ `timestamp` (ต่างจาก `TelemetryValue`) */
export interface HistoryPoint {
  readonly ts: number;
  /** `null` ได้เหมือน `TelemetryValue.value` */
  readonly value: string | null;
}

/** server ยืนยันว่า auth ผ่านแล้ว — ต้องรอ event นี้ก่อนถึงจะ subscribe ได้ */
export interface ConnectedEvent {
  readonly message: string;
}

/**
 * ack ว่า "ยิง subscribe command ไป ThingsBoard สำเร็จ"
 * **ไม่ได้แปลว่ามีข้อมูลจริงส่งมาแล้ว** — device offline ก็ยังได้ ack นี้
 */
export interface SubscribedEvent {
  readonly deviceId: string;
  readonly keys?: readonly string[];
  readonly attributeKeys?: readonly string[];
  readonly attributeScope?: AttributeScope;
  readonly history?: {
    readonly keys: readonly string[];
    readonly startTs: number;
    readonly endTs: number;
  };
  readonly message: string;
}

/** ส่งซ้ำๆ ทุกครั้งที่ device มีค่าใหม่ */
export interface TelemetryDataEvent {
  readonly deviceId: string;
  readonly timestamp: number;
  readonly data: Readonly<Record<string, TelemetryValue>>;
}

/** ส่งเมื่อค่า **เปลี่ยน** เท่านั้น — ค่าไม่ขยับจะไม่มี event (ไม่ใช่บั๊ก) */
export interface AttributeDataEvent {
  readonly deviceId: string;
  readonly scope: AttributeScope;
  readonly timestamp: number;
  readonly data: Readonly<Record<string, TelemetryValue>>;
}

/**
 * ส่งครั้งเดียวหลัง subscribe — `data[key]` เป็น **array ของทุกจุด** ในช่วงที่ขอ
 *
 * ⚠️ **เรียงจากใหม่ไปเก่า** (ts ตัวแรกมากที่สุด) — ยืนยันกับ server จริงแล้ว
 * เอาไปวาดกราฟตรงๆ จะได้เส้นกลับด้าน ต้อง sort ตาม `ts` ขึ้นก่อน
 */
export interface HistoryDataEvent {
  readonly deviceId: string;
  readonly timestamp: number;
  readonly data: Readonly<Record<string, readonly HistoryPoint[]>>;
}

export interface AlarmEntityId {
  readonly entityType: string;
  readonly id: string;
}

export interface AlarmRecord {
  readonly entityId: AlarmEntityId;
  readonly createdTime: number;
  readonly type: string;
  readonly severity: AlarmSeverity;
  readonly status: AlarmStatus;
  readonly originatorName: string;
  readonly acknowledgedTime: number | null;
  readonly clearedTime: number | null;
}

export interface AlarmSubscribedEvent {
  readonly deviceId: string;
  readonly pageSize?: number;
  readonly severities?: readonly AlarmSeverity[];
  readonly statuses?: readonly AlarmStatus[];
  readonly message: string;
}

/** snapshot ชุดแรก (paginated) ส่งครั้งเดียวหลัง subscribe — array ว่างได้ ปกติ */
export interface AlarmDataEvent {
  readonly deviceId: string;
  readonly timestamp: number;
  readonly alarms: readonly AlarmRecord[];
  readonly totalElements: number;
  readonly hasNext: boolean;
}

/** ส่งซ้ำทุกครั้งที่มี alarm เกิดใหม่ / ack / clear */
export interface AlarmUpdateEvent {
  readonly deviceId: string;
  readonly timestamp: number;
  readonly updates: readonly AlarmRecord[];
}

export const SUBSCRIPTION_ERROR_TYPES = [
  'TOKEN_EXPIRED',
  'CONNECTION_ERROR',
  'UNKNOWN_ERROR',
] as const;
export type SubscriptionErrorType = (typeof SUBSCRIPTION_ERROR_TYPES)[number];

/**
 * TB มีปัญหา **หลัง** subscribe สำเร็จแล้ว
 * `TOKEN_EXPIRED` → subscribe ใหม่อีกครั้งเฉยๆ ระบบ refresh token ให้เอง
 */
export interface SubscriptionErrorEvent {
  readonly deviceId: string;
  readonly type: SubscriptionErrorType;
  readonly message: string;
  readonly retryable: boolean;
}

/** auth/validation ผิดตอน connect หรือตอน subscribe */
export interface SocketErrorEvent {
  readonly message: string;
  readonly deviceId?: string;
}

export interface UnsubscribedEvent {
  readonly deviceId: string;
  readonly message: string;
}

/* ══════════════════════════ ชื่อ event ══════════════════════════ */

/** ชื่อ event ที่ client ยิงไป — รวมไว้ที่เดียวกันพิมพ์ผิด */
export const WS_EMIT = {
  subscribeTelemetry: 'subscribe_telemetry',
  unsubscribeTelemetry: 'unsubscribe_telemetry',
  subscribeAlarm: 'subscribe_alarm',
  unsubscribeAlarm: 'unsubscribe_alarm',
} as const;

/** ชื่อ event ที่ server ส่งมา */
export const WS_ON = {
  connect: 'connect',
  connected: 'connected',
  disconnect: 'disconnect',
  error: 'error',
  subscribed: 'subscribed',
  telemetryData: 'telemetry_data',
  attributeData: 'attribute_data',
  historyData: 'history_data',
  subscriptionError: 'subscription_error',
  alarmSubscribed: 'alarm_subscribed',
  alarmData: 'alarm_data',
  alarmUpdate: 'alarm_update',
  alarmUnsubscribed: 'alarm_unsubscribed',
  unsubscribed: 'unsubscribed',
} as const;

/** namespace ที่ต้องต่อท้าย origin ตอนเรียก `io()` */
export const TELEMETRY_NAMESPACE = '/telemetry';

/* ══════════════════════════ ตัวช่วยแปลงค่า ══════════════════════════ */

/**
 * แปลงค่าที่ได้เป็นตัวเลข — คืน `null` ถ้าแปลงไม่ได้
 * ห้ามใช้ `Number(v) || 0` เพราะ `"0"` จะกลายเป็น 0 ที่แยกไม่ออกจาก "แปลงไม่ได้"
 */
export function telemetryNumber(v: string | null | undefined): number | null {
  if (v === undefined || v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** สถานะ relay มาเป็น `"true"` / `"false"` (บาง device ส่ง `"1"` / `"0"`) */
export function telemetryBoolean(v: string | null | undefined): boolean | null {
  if (v === undefined || v === null) return null;
  const s = v.trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'on') return true;
  if (s === 'false' || s === '0' || s === 'off') return false;
  return null;
}
