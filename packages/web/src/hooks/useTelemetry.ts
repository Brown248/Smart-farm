import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AlarmRecord,
  AttributeScope,
  HistoryPoint,
  SubscribeAlarmRequest,
  SubscribeTelemetryRequest,
  TelemetryValue,
} from '@shared/telemetrySocket';
import { readLiveDataConfig } from '@/config/liveData';
import { openTelemetrySocket } from '@/services/telemetrySocket';
import { requestTokenRefresh, tokenProvider } from '@/services/tokenProvider';
import { reportLiveStatus } from '@/state/liveStatus';

/**
 * ต่ออายุ token ได้กี่ครั้งก่อนยอมแพ้ต่อรอบการต่อ socket
 * ต่ออายุแล้วยังโดนปฏิเสธ = ไม่ใช่เรื่องหมดอายุ (สิทธิ์/บัญชีผิดจริง) หยุดไม่ให้วน
 */
const MAX_AUTH_RETRIES = 2;

/**
 * สถานะการไหลของข้อมูล — เอาไปแสดงให้ผู้ใช้รู้ว่ายังสดอยู่ไหม
 *
 * `mock` แยกจาก `offline` โดยตั้งใจ: `mock` = ยังไม่ได้ตั้งค่า/ยังไม่ล็อกอิน (ปกติ ไม่ใช่ปัญหา)
 * ส่วน `offline` = ตั้งค่าครบแล้วแต่ต่อไม่ติด (เป็นปัญหา ต้องบอกผู้ใช้)
 */
export type ConnectionStatus = 'mock' | 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface UseTelemetryOptions {
  /**
   * key ที่อยากได้ — **ไม่ส่ง = ขอทุก key ที่ device ยิงมา** (เอกสารข้อ 2)
   * ใช้โหมดไม่ส่งเป็นหลัก เพราะขอเจาะจงแล้วชื่อผิดจะเงียบ แยกไม่ออกจาก device offline
   */
  readonly keys?: readonly string[];
  readonly attributeKeys?: readonly string[];
  readonly attributeScope?: AttributeScope;
  /** ย้อนหลังกี่มิลลิวินาที — ไม่ส่ง = ไม่ขอ history */
  readonly historyMs?: number;
  readonly historyLimit?: number;
  /** ปิดการต่อ (เช่นหน้ายังไม่ได้เปิด) */
  readonly enabled?: boolean;
  /**
   * รายงานสถานะเข้า `liveStatus` (ป้าย pill บน header) ไหม — ดีฟอลต์ `true`
   *
   * ตั้ง `false` เมื่อมีตัวที่ subscribe หลายตัวในหน้าเดียว (เช่นกราฟขอ history แยก socket)
   * ไม่งั้นตัวรองจะรายงานสถานะทับตัวหลัก (provider) แล้วป้ายบน header เพี้ยน
   */
  readonly reportStatus?: boolean;
  /**
   * subscribe แจ้งเตือน (alarm) ของ device ด้วยไหม — ดีฟอลต์ `false`
   *
   * เปิดเฉพาะตัวหลัก (provider) เพื่อรับ `alarm_data`/`alarm_update` (กฎแจ้งเตือนใน ThingsBoard)
   * ตัวรอง (กราฟที่ขอ history) ไม่ต้องเปิด — จะได้ไม่ subscribe ซ้ำ
   */
  readonly subscribeAlarms?: boolean;
}

export interface UseTelemetryResult {
  /** ค่าล่าสุดของแต่ละ key */
  readonly live: Readonly<Record<string, TelemetryValue>>;
  /** attribute ล่าสุด (สถานะ relay ฯลฯ) */
  readonly attributes: Readonly<Record<string, TelemetryValue>>;
  /** ชุดย้อนหลังที่ preload มาตอน subscribe */
  readonly history: Readonly<Record<string, readonly HistoryPoint[]>>;
  readonly alarms: readonly AlarmRecord[];
  readonly connectionStatus: ConnectionStatus;
  /** เวลาที่ได้ข้อมูลล่าสุด (ms epoch) — `null` = ยังไม่เคยได้เลย */
  readonly lastUpdateAt: number | null;
  /** ข้อความ error ที่อ่านรู้เรื่อง — ไม่ใช่ error ดิบจาก socket */
  readonly errorMessage: string | null;
}

const EMPTY_VALUES: Readonly<Record<string, TelemetryValue>> = {};
const EMPTY_HISTORY: Readonly<Record<string, readonly HistoryPoint[]>> = {};

/**
 * token ปัจจุบันจาก `tokenProvider` แบบตามการเปลี่ยนแปลง
 *
 * เว็บนี้ไม่ทำ login เอง — token มาจาก URL / parent frame / ช่องกรอกโหมด dev
 * ดังนั้นมันมาถึงแบบ async และเปลี่ยนได้ระหว่างทาง ต้องฟังไม่ใช่อ่านครั้งเดียว
 */
export function useAccessToken(): string | null {
  const [token, setToken] = useState<string | null>(() => tokenProvider.getToken());
  useEffect(() => {
    // อ่านซ้ำตอน mount กันกรณี token มาถึงก่อน effect นี้ทำงาน
    setToken(tokenProvider.getToken());
    return tokenProvider.onChange(setToken);
  }, []);
  return token;
}

/**
 * subscribe telemetry ของโรงเรือน A1 ตลอดอายุของ component
 *
 * ⚠️ **ต้อง unsubscribe + disconnect ตอน unmount** ไม่งั้น backend จะเปิด WebSocket
 * ไป ThingsBoard ค้างไว้โดยไม่มีใครฟัง (เอกสารเตือนไว้ชัดในข้อ 7)
 * cleanup ของ `useEffect` เรียก `handle.close()` ซึ่งทำทั้งสองอย่างให้แล้ว
 *
 * ถ้ายังไม่ได้ตั้ง env หรือยังไม่ได้ล็อกอิน จะคืน `connectionStatus: 'mock'`
 * แล้วไม่เปิด socket เลย — หน้าเพจใช้ข้อมูลจำลองต่อได้ตามปกติ ไม่ error
 */
export function useTelemetry(opts: UseTelemetryOptions): UseTelemetryResult {
  const accessToken = useAccessToken();
  const cfg = readLiveDataConfig();

  const [live, setLive] = useState<Readonly<Record<string, TelemetryValue>>>(EMPTY_VALUES);
  const [attributes, setAttributes] =
    useState<Readonly<Record<string, TelemetryValue>>>(EMPTY_VALUES);
  const [history, setHistory] =
    useState<Readonly<Record<string, readonly HistoryPoint[]>>>(EMPTY_HISTORY);
  const [alarms, setAlarms] = useState<readonly AlarmRecord[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('mock');
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * นับจำนวนครั้งที่สั่งต่ออายุ token ต่อการต่อ socket หนึ่งช่วง — กันวนไม่รู้จบ
   * อยู่นอก effect เพราะต้องอยู่รอดข้ามการต่อใหม่ · รีเซ็ตเป็น 0 เมื่อต่อติดสำเร็จ
   */
  const authRetries = useRef(0);

  /*
   * แตก `cfg` ออกเป็นค่าเดี่ยวๆ ก่อน แล้วให้ effect/memo ผูกกับค่าพวกนี้
   * `readLiveDataConfig()` สร้าง object ใหม่ทุกครั้งที่เรียก ถ้าใส่ `cfg` ลง dependency
   * ตรงๆ socket จะถูกปิด-เปิดใหม่ทุก render
   */
  const wsUrl = cfg?.wsUrl ?? null;
  const deviceId = cfg?.deviceId ?? null;
  const orgId = cfg?.orgId ?? null;

  const enabled = opts.enabled ?? true;
  const canConnect = enabled && wsUrl !== null && accessToken !== null;

  /**
   * เก็บ option ไว้ใน ref เพื่อไม่ให้ effect ผูกกับ array/object ที่สร้างใหม่ทุก render
   * ถ้าใส่ `opts` ลง dependency ตรงๆ socket จะถูกปิด-เปิดใหม่ทุกครั้งที่ parent re-render
   */
  const keysSig = (opts.keys ?? []).join(',');
  const attrSig = (opts.attributeKeys ?? []).join(',');
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const request = useMemo<SubscribeTelemetryRequest | null>(() => {
    if (deviceId === null || orgId === null) return null;
    const o = optsRef.current;
    // ไม่ใส่ field `keys` เลยเมื่อไม่ได้ระบุ — ส่ง array ว่างไปจะได้ "ไม่ขอ key อะไรเลย"
    const base =
      o.keys && o.keys.length > 0 ? { deviceId, orgId, keys: o.keys } : { deviceId, orgId };
    const withAttr =
      o.attributeKeys && o.attributeKeys.length > 0
        ? {
            ...base,
            attributeKeys: o.attributeKeys,
            ...(o.attributeScope ? { attributeScope: o.attributeScope } : {}),
          }
        : base;
    if (o.historyMs === undefined) return withAttr;
    const endTs = Date.now();
    return {
      ...withAttr,
      history: {
        // history **ต้อง** ระบุ keys (เอกสารบังคับ) — ไม่มีก็ขอ history ไม่ได้
        keys: o.keys ?? [],
        startTs: endTs - o.historyMs,
        endTs,
        ...(o.historyLimit === undefined ? {} : { limit: o.historyLimit }),
      },
    };
    /*
     * `keysSig`/`attrSig` แทนการเทียบ array — เนื้อหาเปลี่ยนจริงเท่านั้นจึงสร้างคำขอใหม่
     * eslint มองว่าเกินเพราะอ่าน option ผ่าน `optsRef` มันจึงไม่เห็นว่าใช้อะไร
     * แต่ตัดออกไม่ได้ ไม่งั้นเปลี่ยน `keys` แล้วจะไม่ subscribe ใหม่
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, orgId, keysSig, attrSig, opts.attributeScope, opts.historyMs, opts.historyLimit]);

  /** คำขอ subscribe alarm — ไม่ filter (รับทุกอัน) · เปิดเฉพาะเมื่อ `subscribeAlarms` */
  const alarmRequest = useMemo<SubscribeAlarmRequest | undefined>(() => {
    if (!opts.subscribeAlarms || deviceId === null || orgId === null) return undefined;
    return { deviceId, orgId, pageSize: 100 };
  }, [opts.subscribeAlarms, deviceId, orgId]);

  useEffect(() => {
    if (!canConnect || wsUrl === null || !accessToken || !request) {
      setStatus('mock');
      return;
    }

    setStatus('connecting');
    setErrorMessage(null);

    const stamp = (): void => setLastUpdateAt(Date.now());

    /*
     * token ใช้ไม่ได้ = server ยิง `error` แล้ว **ตัดการเชื่อมต่อทันที** (ตรวจกับ server จริงแล้ว:
     * `connect` → `error: Invalid authentication token` → `disconnect: io server disconnect`)
     * socket.io ไม่ต่อกลับเองเมื่อ server เป็นฝ่ายตัด ถ้าปล่อยให้ `disconnect` ทับสถานะเป็น
     * "กำลังเชื่อมต่อใหม่…" ผู้ใช้จะรอเก้อตลอดกาลทั้งที่ไม่มีใครพยายามต่ออีกแล้ว
     */
    let fatal = false;

    const handle = openTelemetrySocket({
      wsUrl,
      // ไม่ส่ง token เข้าไป — service ดึงจาก `tokenProvider` เองและต่อใหม่เมื่อ token เปลี่ยน
      telemetry: request,
      ...(alarmRequest ? { alarm: alarmRequest } : {}),
      handlers: {
        onConnected: () => {
          setStatus('live');
          // ต่อติดแล้ว = token ใช้ได้ · รีเซ็ตตัวนับต่ออายุให้พร้อมรอบหน้า
          authRetries.current = 0;
        },
        onTelemetry: (e) => {
          setLive((prev) => ({ ...prev, ...e.data }));
          stamp();
          // ข้อมูลไหลเข้าจริง = การเชื่อมต่อกลับมาปกติ — กู้ป้ายจาก "reconnecting" ที่อาจค้างอยู่
          // (เดิม 'live' ตั้งแค่ตอน onConnected ครั้งแรก พอ degrade ชั่วคราวแล้วป้ายไม่กลับ)
          if (!fatal) {
            setStatus('live');
            setErrorMessage(null);
          }
        },
        onAttribute: (e) => {
          setAttributes((prev) => ({ ...prev, ...e.data }));
          stamp();
        },
        onHistory: (e) => {
          setHistory(e.data);
          stamp();
        },
        onAlarmData: (e) => setAlarms(e.alarms),
        onAlarmUpdate: (e) => setAlarms(e.updates),
        onSubscriptionError: (e) => {
          // TOKEN_EXPIRED ถูก resubscribe ให้แล้วในตัว service — ไม่ต้องแจ้งผู้ใช้
          if (e.type === 'TOKEN_EXPIRED') return;
          setStatus(e.retryable ? 'reconnecting' : 'offline');
          setErrorMessage(e.message);
        },
        onError: (e) => {
          fatal = true;
          setStatus('offline');
          setErrorMessage(e.message);
          /*
           * token โดนปฏิเสธ (มักเพราะหมดอายุ) → สั่งต่ออายุ พอ token ใหม่ถูก publish
           * `accessToken` จะเปลี่ยน effect นี้รันใหม่และต่อ socket ด้วย token สดเอง
           * (ตอนนั้น setStatus('connecting') + setErrorMessage(null) เคลียร์ให้แล้ว ไม่ต้องทำที่นี่)
           * จำกัดจำนวนครั้งกัน loop: ต่ออายุแล้วยังโดนปฏิเสธก็หยุด (รหัส/สิทธิ์ผิดจริง ไม่ใช่หมดอายุ)
           */
          if (authRetries.current < MAX_AUTH_RETRIES) {
            authRetries.current += 1;
            void requestTokenRefresh();
          }
        },
        onDisconnect: (reason) => {
          // token หายไปเฉยๆ (ออกจากระบบ) — effect นี้กำลังจะถูกรื้อและตั้งเป็น mock อยู่แล้ว
          if (reason === 'token cleared') return;
          setStatus(fatal || reason === 'io server disconnect' ? 'offline' : 'reconnecting');
        },
      },
    });

    return () => handle.close();
    /*
     * `accessToken` อยู่ใน dependency เพราะต้องเปิด/ปิด socket ตามการมี-ไม่มี token
     * ส่วนการ "เปลี่ยนตัว" token ระหว่างที่ socket เปิดอยู่ service จัดการเองผ่าน `onChange`
     */
  }, [canConnect, wsUrl, accessToken, request, alarmRequest]);

  /** บอกป้ายสถานะบน header ให้รู้ด้วย — มันอยู่เหนือตัวที่ subscribe จึงอ่าน state นี้ตรงๆ ไม่ได้ */
  const reportStatus = opts.reportStatus ?? true;
  useEffect(() => {
    if (!reportStatus) return;
    reportLiveStatus(status, errorMessage);
  }, [status, errorMessage, reportStatus]);

  return {
    live,
    attributes,
    history,
    alarms,
    connectionStatus: status,
    lastUpdateAt,
    errorMessage,
  };
}
