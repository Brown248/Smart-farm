import { useCallback, useEffect, useRef, useState } from 'react';
import type { Device, DeviceId } from '@shared/device';
import type { HsCommand, HsDays } from '@shared/handysense';
import type { LogEntry } from '@/data/devices';
import type { DeviceScheduleSlot, FanTempThreshold } from '@/data/greenhouse';
import { useFarmState } from '@/state/FarmStateProvider';
import { useLiveSnapshot } from '@/state/liveStatus';
import { guard } from '@/lib/guards';
import { deviceName } from '@/lib/deviceLabel';
import { DONE_FLASH_MS, LED_CONFIRM_TIMEOUT_MS, SEND_LATENCY_MS } from '@/lib/deviceTiming';
import { bondedTo, channelOf } from '@/config/deviceChannels';
import { validateHsCommand } from '@/lib/handysenseValidate';
import {
  createHsTracker,
  HsPostTimeoutError,
  HsTrackError,
  newReqId,
  postHsCommand,
  readHsContext,
} from '@/services/handysenseControl';
import type { Dict } from '@/i18n/keys';
import type { ConfirmApi } from './useConfirm';
import { useEstop } from './useEstop';

// ค่าเวลาย้ายไป `lib/deviceTiming` (โมดูลกลาง) — re-export ให้ import เดิม/เทสยังใช้ได้
export { SEND_LATENCY_MS, DONE_FLASH_MS, PUMP_CUTOFF_MS } from '@/lib/deviceTiming';
export { LOG_LIMIT } from './useEstop';

export interface UseDeviceCommandOptions {
  readonly t: Dict;
  /** อุณหภูมิที่ guard rule G2 ใช้ตัดสิน */
  readonly temp: number;
  readonly confirm: ConfirmApi;
  readonly flash: (message: string) => void;
}

export interface DeviceCommandApi {
  readonly devices: readonly Device[];
  readonly estop: boolean;
  readonly tank: number;
  readonly log: readonly LogEntry[];
  /** อุปกรณ์ที่เพิ่งทำคำสั่งเสร็จ — ใช้โชว์ ✓ ชั่วครู่ */
  readonly justDone: Readonly<Partial<Record<DeviceId, boolean>>>;
  /** มีคำสั่งค้างอยู่อย่างน้อยหนึ่งตัว */
  readonly busy: boolean;
  readonly press: (id: DeviceId) => void;
  readonly toggleAuto: (id: DeviceId) => void;
  /** โหมดควบคุมจริงเปิดอยู่ไหม — โหมดจริง auto/manual สั่งที่ส่วนเงื่อนไข (setThreshold) ปุ่มบนการ์ดจึง disable */
  readonly realControl: boolean;
  readonly estopPress: () => void;
  readonly addLog: (text: string) => void;

  /** ปั๊มกำลังจ่ายน้ำอยู่ไหม = ทั้งโรงเรือนกำลังโดนน้ำ */
  readonly watering: boolean;
  /** เริ่ม/หยุดรดน้ำทั้งโรงเรือน — ผ่าน guard ชุดเดียวกับการกดปั๊มตรงๆ */
  readonly waterAll: () => void;
  /** ส่งเกณฑ์อุณหภูมิอัตโนมัติไปอุปกรณ์จริง (HandySense setThreshold) — โหมดจริงเท่านั้น */
  readonly sendThreshold: (id: DeviceId, cfg: FanTempThreshold) => void;
  /** ปิดโหมดอัตโนมัติ **พร้อมสั่งดับรีเลย์จริง** (setThreshold no-auto → setSwitch off · G2 เตือน/ยืนยัน) — โหมดจริงเท่านั้น */
  readonly disableTempAuto: (id: DeviceId) => void;
  /** บันทึกตารางเวลา slot หนึ่งไปอุปกรณ์ (setSchedule โหมด A — ส่ง days+เวลา · slot จาก `cfg.slot`) */
  readonly sendScheduleSave: (id: DeviceId, cfg: DeviceScheduleSlot) => void;
  /** พัก/เปิดใช้ตาราง slot (setSchedule โหมด B — **ส่ง enable อย่างเดียว ห้ามมี days**) — โหมดจริงเท่านั้น */
  readonly sendScheduleToggle: (id: DeviceId, slot: number, enable: boolean) => void;
  /** ลบตาราง slot ออกจากอุปกรณ์ถาวร (setSchedule โหมด A ไม่ติ๊กวัน + enable:false) — โหมดจริงเท่านั้น · ต้องยืนยันก่อน */
  readonly sendScheduleDelete: (id: DeviceId, slot: number) => void;
}

/**
 * แปลง error ของคำสั่งจริงเป็นข้อความที่ผู้ใช้อ่านรู้เรื่อง — **ที่เดียว** ใช้ร่วมกันทั้ง 3 เส้นทางคำสั่ง
 * (`sendReal` · `sendThreshold` · `sendConfigCommand`) ของเดิมคัดลอกบล็อกเดียวกันไว้ 3 ที่
 * พอเพิ่มเหตุผิดพลาดใหม่ (POST หมดเวลา) จึงมีโอกาสเติมไม่ครบแล้วบางปุ่มบอกสาเหตุผิด
 */
function commandErrorMessage(e: unknown, tt: Dict): string {
  if (e instanceof HsTrackError) {
    if (e.failure.kind === 'timeout') return tt.hsUnknown;
    const r = e.failure.result;
    return r.partial ? tt.hsPartial : (r.error ?? tt.hsFailed);
  }
  // POST ค้างจนครบเวลา — บอกให้ชัดว่าเป็นเรื่องเครือข่าย ผู้ใช้จะได้ลองใหม่ ไม่ใช่คิดว่าอุปกรณ์พัง
  if (e instanceof HsPostTimeoutError) return tt.hsSendTimeout;
  return tt.hsSendError; // POST พลาดด้วยเหตุอื่น (token หมดอายุ / CORS / network)
}

/**
 * ห่วงโซ่ความปลอดภัยของคำสั่งอุปกรณ์ — พอร์ตตรงจากต้นแบบ ห้ามลดขั้นตอน (สเปกข้อ 7.3)
 *
 *   ออฟไลน์?  → บล็อก + บอกเหตุผล
 *   estop?    → บล็อก + บอกให้ปลดล็อกก่อน
 *   pending?  → เมิน (ปุ่มถูก disable อยู่แล้ว)
 *   guard?    → บล็อก + บอกกฎที่ชน
 *   ผ่านหมด   → ถามยืนยัน → sending (pending) → settle → เขียน control log
 *
 * `pending` แยก "ส่งคำสั่งแล้ว" ออกจาก "อุปกรณ์ทำงานจริงแล้ว" เพราะ pub/sub ไม่การันตี
 *
 * hook นี้ **ไม่ได้เป็นเจ้าของสถานะ** แล้ว — อ่าน/เขียนผ่าน `FarmStateProvider`
 * เพราะอุปกรณ์ 5 ตัวเป็นของจริงชุดเดียว หน้าไหนสั่งก็ต้องเห็นตรงกันทุกหน้า
 */
export function useDeviceCommand({
  t,
  temp,
  confirm,
  flash,
}: UseDeviceCommandOptions): DeviceCommandApi {
  const {
    devices,
    setDevices,
    estop,
    tank,
    log,
    setMode,
    watering,
    realControl,
    live,
    noteManualFanCommand,
  } = useFarmState();
  // หยุดฉุกเฉิน + การเขียน log เป็นของ `useEstop` — ปุ่มในแถบเมนูใช้ตัวเดียวกันนี้
  const { estopPress, addLog } = useEstop({ t, confirm, flash });
  const [justDone, setJustDone] = useState<Partial<Record<DeviceId, boolean>>>({});

  // อ่านค่าล่าสุดตอน callback ทำงาน (เช่น สลับภาษาระหว่างรอคำสั่ง settle)
  const tRef = useRef(t);
  tRef.current = t;
  const tempRef = useRef(temp);
  tempRef.current = temp;
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const estopRef = useRef(estop);
  estopRef.current = estop;
  const flashRef = useRef(flash);
  flashRef.current = flash;
  const realControlRef = useRef(realControl);
  realControlRef.current = realControl;
  // สถานะการเชื่อมต่อล่าสุด — ใช้แยก "โหมดจำลองแท้" (mock/offline) ออกจาก "หลุดชั่วคราว" (reconnecting)
  const liveStatusRef = useRef(live.status);
  liveStatusRef.current = live.status;
  // อุปกรณ์ออฟไลน์ (shadow_ts เก่า) — socket ต่อติดแต่ตัวอุปกรณ์เงียบ · กันสั่งเพราะคำสั่งจะไม่ทำงานจริง
  // deviceBanned (netpie_banned) — อุปกรณ์ถูกระงับ · ถ้ากดสั่งระบบจะตอบ ok:true (คำสั่งค้างที่ NETPIE
  // อุปกรณ์ไม่ได้รับ) ทำให้ผู้ใช้เข้าใจผิดว่าสำเร็จ → ต้องกันปุ่ม (ยืนยันกับทีม backend 2026-08-07)
  const { deviceStale, deviceBanned } = useLiveSnapshot();
  const staleRef = useRef(deviceStale);
  staleRef.current = deviceStale;
  const bannedRef = useRef(deviceBanned);
  bannedRef.current = deviceBanned;

  /**
   * ตั้งเวลาแล้ว **ลบตัวเองออกตอนยิง** — ของเดิมเป็น array ที่ push อย่างเดียว ไม่เคยลบ
   * แท็บเล็ตเปิดค้างทั้งวันแล้วสั่งงานบ่อยๆ รายการจะสะสมไปเรื่อยๆ โดยไม่มีใครใช้แล้ว
   */
  const timers = useRef<Set<number>>(new Set());
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);

  // ตัวจับคู่ reqId ↔ cmd_result (โหมดจริง) — ป้อนจาก live.command ที่ไหลเข้ามา
  // lazy init: สร้าง tracker ครั้งเดียว ไม่ใช่ทุก render
  const trackerRef = useRef<ReturnType<typeof createHsTracker> | null>(null);
  trackerRef.current ??= createHsTracker();
  const tracker = trackerRef.current;
  useEffect(() => {
    tracker.feed(live.command);
  }, [tracker, live.command]);

  // นับรุ่นคำสั่งต่ออุปกรณ์ — กัน fallback timer ของคำสั่งเก่าไปเคลียร์ pending ของคำสั่งใหม่
  const cmdGenRef = useRef<Partial<Record<DeviceId, number>>>({});
  // กัน toast เด้งบนหน้าที่ถูก unmount ไปแล้ว — ออกจากหน้าระหว่างรอผล ไม่ควรมีข้อความโผล่
  const mountedRef = useRef(true);
  useEffect(() => {
    // ตั้งกลับ true ตอน (re)mount — StrictMode dev เรียก mount→cleanup→mount ไม่งั้นค้าง false
    mountedRef.current = true;
    const pending = timers.current;
    return () => {
      mountedRef.current = false;
      pending.forEach((id) => window.clearTimeout(id));
      pending.clear();
      tracker.clear();
    };
  }, [tracker]);

  const patch = useCallback(
    (id: DeviceId, next: Partial<Device>) => {
      setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, ...next } : d)));
    },
    [setDevices],
  );

  /**
   * อุปกรณ์พ่วง (พัดลมเล็ก↔ใหญ่ #1) ไม่มี channel ของตัวเอง — ตั้งเกณฑ์/ตารางแยกไม่ได้
   * (จะไปทับ config ของตัวหลักบน channel เดียวกัน) → บล็อก + บอกให้ไปตั้งที่ตัวหลัก
   * คืน `true` = ถูกบล็อก (ผู้เรียกต้อง return)
   */
  const bondedReject = useCallback((id: DeviceId): boolean => {
    const master = bondedTo(id);
    if (master === null) return false;
    const m = devicesRef.current.find((x) => x.id === master);
    flashRef.current(tRef.current.ghBondedFollows(m ? deviceName(m, tRef.current) : ''));
    return true;
  }, []);

  /**
   * โหมดจริง (HandySense): ยิง `setSwitch` จริงแล้วรอ cmd_result จับคู่ reqId
   * - `Device.on` **ไม่** flip เอง — provider จะ reconcile จาก `led{channel}` จริง (กฎ #2 · guide ข้อ 7)
   * - pending = "ส่งคำสั่งแล้ว รอยืนยัน" · คง pending **จนกว่า led จริงจะเปลี่ยน** (~8 วิ จากที่วัด)
   *   ไม่ใช่ปลดตอน cmd_result เพราะสวิตช์จะดูค้างสถานะเดิม 8 วิ · provider เคลียร์ pending เมื่อ led ตรง
   * - safety: ถ้า led ไม่ยืนยันใน 16 วิ (เช่น automation ทับ) → ปลด pending เอง ไม่ให้ค้าง
   * - fail/timeout/partial → ปลด pending ทันที + แจ้งเตือนตามเหตุ
   */
  const sendReal = useCallback(
    (id: DeviceId, target: boolean, logText?: (tt: Dict) => string) => {
      const tt = tRef.current;
      const channel = channelOf(id);
      if (channel === null) return flashRef.current(tt.hsPumpNotWired);
      const cmd = { action: 'setSwitch' as const, channel, on: target };
      if (validateHsCommand(cmd)) return flashRef.current(tt.hsInvalid);
      const ctx = readHsContext();
      if (ctx === null) return flashRef.current(tt.hsSendError);

      const gen = (cmdGenRef.current[id] ?? 0) + 1;
      cmdGenRef.current[id] = gen;
      patch(id, { pending: target ? 'on' : 'off' });
      const reqId = newReqId();

      /*
       * ⏱ safety timer ต้องตั้ง **ก่อน** ยิงคำสั่ง ไม่ใช่ข้างใน `.then()`
       *
       * ของเดิมตั้งไว้ใน `.then()` หลัง cmd_result → ถ้า chain ไม่เดินเลย (POST ค้างเพราะเน็ตแขวน)
       * timer ก็ไม่เคยถูกตั้ง → `pending` ค้างถาวร ปุ่มกดไม่ได้จนกว่าจะรีโหลดหน้า
       * ตั้งตรงนี้แล้ว pending ถูกปลดเสมอ ไม่ว่าคำสั่งจะสำเร็จ ล้มเหลว หรือค้างกลางทาง
       *
       * เส้นทางอื่นที่ปลด pending ไปก่อน (สำเร็จ/พลาด) จะทำให้ `stillPending` เป็น false
       * ตัวนี้จึงกลายเป็น no-op ไม่เด้ง toast ซ้ำ
       */
      later(() => {
        if (cmdGenRef.current[id] !== gen) return;
        // provider เคลียร์ pending ทันทีที่ led ยืนยัน → ถ้ายังค้าง แปลว่า led ไม่เปลี่ยนในเวลาที่กำหนด
        // (automation ทับ / อุปกรณ์ไม่รายงาน) — อย่าเงียบ ต้องบอกผู้ใช้ ไม่งั้นดูเหมือน "กดแล้วเด้งกลับ"
        const stillPending = devicesRef.current.find((x) => x.id === id)?.pending != null;
        if (!stillPending) return;
        patch(id, { pending: null });
        if (mountedRef.current) flashRef.current(tRef.current.hsUnconfirmed);
      }, LED_CONFIRM_TIMEOUT_MS);

      postHsCommand(ctx, cmd, reqId)
        .then(() => tracker.track(reqId))
        .then(() => {
          // cmd_result ok = อุปกรณ์รับคำสั่งแล้ว · **คง pending ต่อ** รอ led จริงยืนยัน (provider เคลียร์ให้)
          const tt2 = tRef.current;
          const d = devicesRef.current.find((x) => x.id === id);
          if (d)
            addLog(
              logText
                ? logText(tt2)
                : tt2.logManual(target ? tt2.actOn : tt2.actOff, deviceName(d, tt2)),
            );
        })
        .catch((e: unknown) => {
          // เคลียร์ pending/toast เฉพาะถ้ายังเป็นคำสั่งรุ่นนี้ (ตรงกับ success path :194)
          // ไม่งั้นคำสั่ง A ที่ timeout ทีหลังจะล้าง pending ของคำสั่ง B ที่กดใหม่ + เด้ง toast
          // "ล้มเหลว/ไม่ทราบผล" ทั้งที่ B ยังทำงานอยู่ (โดยเฉพาะตอน cmd_result หาย/ถูกกรองทิ้ง)
          if (cmdGenRef.current[id] !== gen) return;
          patch(id, { pending: null });
          if (!mountedRef.current) return;
          flashRef.current(commandErrorMessage(e, tRef.current));
        });
    },
    [addLog, later, patch, tracker],
  );

  /**
   * `logText` ให้ผู้เรียกเขียนบรรทัด log เองได้ (รับ `Dict` ตอน settle
   * เพราะผู้ใช้อาจสลับภาษาระหว่างรอคำสั่ง) — ใช้กับ "รดน้ำทั้งโรงเรือน"
   * ที่ควรอ่านว่ารดน้ำ ไม่ใช่ "สั่งเปิด ปั๊มน้ำ"
   *
   * โหมดจริง → `sendReal` (ยิงคำสั่งจริง) · โหมดจำลอง → หน่วงเวลาแล้ว settle เหมือนเดิม
   * หมายเหตุ: auto-cutoff ปั๊ม 20 นาที อยู่ที่ `FarmStateProvider` (ระดับแอป)
   */
  const send = useCallback(
    (id: DeviceId, target: boolean, logText?: (tt: Dict) => string) => {
      // คำสั่งมือของผู้ใช้ — ตัวคุมความชื้นต้องไม่ทับพัดลมตัวนี้จนกว่ารอบดูดจะจบ
      noteManualFanCommand(id);
      if (realControlRef.current) return sendReal(id, target, logText);
      // หลุดชั่วคราว (เคย live แล้วกำลังต่อใหม่): อย่าตกไป mock path ที่ fake สถานะในเครื่อง
      // แล้วเด้งกลับตอน led จริงไหลมาทีหลัง — บล็อกไว้ บอกให้รอ/ลองใหม่ (จุดพลาดที่ reviewer จับได้)
      if (liveStatusRef.current === 'reconnecting')
        return flashRef.current(tRef.current.hsReconnecting);
      patch(id, { pending: target ? 'on' : 'off' });
      later(() => {
        const tt = tRef.current;
        patch(id, { pending: null, on: target });
        const d = devicesRef.current.find((x) => x.id === id);
        if (d)
          addLog(
            logText ? logText(tt) : tt.logManual(target ? tt.actOn : tt.actOff, deviceName(d, tt)),
          );
        setJustDone((prev) => ({ ...prev, [id]: true }));
        later(() => setJustDone((prev) => ({ ...prev, [id]: false })), DONE_FLASH_MS);
      }, SEND_LATENCY_MS);
    },
    [addLog, later, noteManualFanCommand, patch, sendReal],
  );

  const press = useCallback(
    (id: DeviceId) => {
      const tt = tRef.current;
      const d = devicesRef.current.find((x) => x.id === id);
      if (!d) return;
      const name = deviceName(d, tt);

      if (!d.online) return flash(tt.offlineBlocked(name));
      if (estopRef.current) return flash(tt.estopBlocked);
      // อุปกรณ์ถูกระงับ (netpie_banned) → ระบบตอบ ok:true แต่อุปกรณ์ไม่ได้รับคำสั่ง · กันก่อน (เฉพาะเจาะจงกว่า)
      if (realControlRef.current && bannedRef.current) return flash(tt.hsDeviceBanned);
      // อุปกรณ์ออฟไลน์ (ค่าค้าง) → คำสั่งไปถึง backend แต่อุปกรณ์ไม่ทำงาน · กันไว้ไม่ให้ผู้ใช้กดเก้อ
      if (realControlRef.current && staleRef.current) return flash(tt.hsDeviceOffline);
      if (d.pending != null) return;
      // อุปกรณ์พ่วง (พัดลมเล็ก) ไม่มี relay แยก → สั่งเองไม่ได้ ต้องคุมผ่านตัวหลัก (กันไว้เผื่อ UI หลุด)
      const master = bondedTo(id);
      if (master) {
        const m = devicesRef.current.find((x) => x.id === master);
        return flash(tt.ghBondedFollows(m ? deviceName(m, tt) : ''));
      }
      // safety: อุปกรณ์ที่ไม่มี relay (ไม่มีในตอนนี้) สั่งจริงไม่ได้
      if (realControlRef.current && channelOf(id) === null) return flash(tt.hsPumpNotWired);

      const target = !d.on;
      const blocked = guard(id, target, {
        devices: devicesRef.current,
        tank,
        temp: tempRef.current,
        t: tt,
      });
      // guard ทัก = โชว์กล่อง "คำเตือน" ให้เลือกยืนยันทำต่อ หรือยกเลิก (เจ้าของงานสั่งให้ override ได้)
      if (blocked) {
        confirm.ask({
          title: tt.guardWarnTitle,
          body: blocked,
          tone: 'warn',
          confirmLabel: tt.guardProceed,
          run: () => send(id, target),
        });
        return;
      }

      confirm.ask({
        title: tt.confirmDevTitle(target ? tt.actOn : tt.actOff, name),
        // เปิดปั๊ม = ย้ำให้เช็คน้ำในถังก่อน (แทน guard G1 ที่ถอดออก)
        body: id === 'pump' && target ? tt.confirmPumpBody : tt.confirmDevBody,
        run: () => send(id, target),
      });
    },
    [confirm, flash, send, tank],
  );

  /**
   * รดน้ำทั้งโรงเรือน — ปั๊มมีตัวเดียวและไม่มีวาล์วแยกแปลง เปิดทีเดียวน้ำไปทุกโซน
   * ไล่ห่วงโซ่ความปลอดภัยชุดเดียวกับ `press('pump')` เป๊ะ (ออฟไลน์ → estop → pending → guard G2)
   * ต่างกันแค่ถ้อยคำ ที่บอกว่ากำลังรดน้ำ ไม่ใช่ "สั่งเปิดปั๊ม" · เปิด = ยืนยันเช็คน้ำก่อน
   */
  const waterAll = useCallback(() => {
    const tt = tRef.current;
    const d = devicesRef.current.find((x) => x.id === 'pump');
    if (!d) return;
    const name = deviceName(d, tt);

    if (!d.online) return flash(tt.offlineBlocked(name));
    if (estopRef.current) return flash(tt.estopBlocked);
    if (realControlRef.current && bannedRef.current) return flash(tt.hsDeviceBanned);
    if (realControlRef.current && staleRef.current) return flash(tt.hsDeviceOffline);
    if (d.pending != null) return;
    // โหมดจริง: ปั๊มยังไม่ต่อ relay จริง → รดน้ำจริงไม่ได้ (แจ้งแล้วหยุด)
    if (realControlRef.current && channelOf('pump') === null) return flash(tt.hsPumpNotWired);

    const target = !d.on;
    const blocked = guard('pump', target, {
      devices: devicesRef.current,
      tank,
      temp: tempRef.current,
      t: tt,
    });
    // guard ทัก = โชว์กล่องคำเตือน ให้ยืนยันทำต่อหรือยกเลิก (ชุดเดียวกับ press)
    if (blocked) {
      confirm.ask({
        title: tt.guardWarnTitle,
        body: blocked,
        tone: 'warn',
        confirmLabel: tt.guardProceed,
        run: () => send('pump', target),
      });
      return;
    }

    confirm.ask({
      title: target ? tt.waterTitle : tt.stopTitle,
      // เริ่มรดน้ำ = ย้ำให้เช็คระดับน้ำในถังก่อน (แทน guard G1 ที่ถอดออก)
      body: target ? tt.confirmPumpBody : tt.stopBody,
      run: () => {
        send('pump', target, (cur) => (target ? cur.logWaterStart : cur.logWaterStop));
        flash(target ? tt.waterToast : tt.stopToast);
      },
    });
  }, [confirm, flash, send, tank]);

  /**
   * ส่งเกณฑ์อุณหภูมิอัตโนมัติไปอุปกรณ์จริง (setThreshold) — โหมดจริงเท่านั้น
   * - enabled → mode auto พร้อม temp{min,max} · soil ส่ง {enabled:false} (พัดลมไม่ใช้ soil · แต่ API บังคับส่งคู่)
   * - !enabled → mode no-auto (ห้ามส่ง temp/soil)
   * - **`partial:true` = สำคัญ** (setThreshold ส่ง 4 ค่าเรียงกัน พลาดกลางทาง) → เตือนแรง `hsPartial`
   */
  const sendThreshold = useCallback(
    (id: DeviceId, cfg: FanTempThreshold) => {
      const tt = tRef.current;
      const channel = channelOf(id);
      if (channel === null) return flashRef.current(tt.hsPumpNotWired);
      if (bondedReject(id)) return;
      if (!realControlRef.current) return flashRef.current(tt.hsNotLive);
      if (bannedRef.current) return flashRef.current(tt.hsDeviceBanned);
      if (staleRef.current) return flashRef.current(tt.hsDeviceOffline);
      const cmd: HsCommand = cfg.enabled
        ? {
            action: 'setThreshold',
            channel,
            mode: 'auto',
            temp: { enabled: true, min: cfg.min, max: cfg.max },
            soil: { enabled: false },
          }
        : { action: 'setThreshold', channel, mode: 'no-auto' };
      // ข้อผิดพลาดที่ผู้ใช้พบจริงจากช่องนี้คือ min ≥ max → บอกชัดเจน (ที่เหลือ NumberField คุมช่วง 0-60 ไว้แล้ว)
      const err = validateHsCommand(cmd);
      if (err) return flashRef.current(err === 'minMax' ? tt.hsInvalidRange : tt.hsInvalid);
      const ctx = readHsContext();
      if (ctx === null) return flashRef.current(tt.hsSendError);

      flashRef.current(tt.hsSending);
      const reqId = newReqId();
      postHsCommand(ctx, cmd, reqId)
        .then(() => tracker.track(reqId))
        .then(() => {
          if (!mountedRef.current) return;
          const tt2 = tRef.current;
          flashRef.current(cfg.enabled ? tt2.hsThresholdOk : tt2.hsThresholdOff);
          const d = devicesRef.current.find((x) => x.id === id);
          if (d)
            addLog(
              tt2.logMode(deviceName(d, tt2), cfg.enabled ? tt2.modeAutoFull : tt2.modeManualFull),
            );
        })
        .catch((e: unknown) => {
          if (!mountedRef.current) return;
          flashRef.current(commandErrorMessage(e, tRef.current));
        });
    },
    [addLog, bondedReject, tracker],
  );

  /**
   * ปิดโหมดอัตโนมัติ (temp) ของพัดลม **พร้อมสั่งดับรีเลย์จริง** — โหมดจริงเท่านั้น
   *
   * เจ้าของงานต้องการ: "ปิดออโต้ = ฉันคุมเอง สั่งดับ" ต้องมีผลเหนือเงื่อนไขอุณหภูมิของอุปกรณ์
   * เดิม `sendThreshold({enabled:false})` ส่งแค่ `mode:'no-auto'` → รีเลย์ค้างเปิด (auto ปิดแต่พัดลมไม่ดับ)
   * ที่นี่: (1) ปิด auto ในอุปกรณ์ก่อน (กัน re-open race แบบ pump-cutoff) แล้ว (2) `setSwitch off` จริง
   * ผ่าน G2 (ปิดพัดลมใหญ่ตัวสุดท้ายตอนร้อน >33°C) แบบเตือน+ยืนยันได้ (ชุดเดียวกับ `press`)
   */
  const disableTempAuto = useCallback(
    (id: DeviceId) => {
      const tt = tRef.current;
      const channel = channelOf(id);
      if (channel === null) return flashRef.current(tt.hsPumpNotWired);
      if (bondedReject(id)) return;
      if (!realControlRef.current) return flashRef.current(tt.hsNotLive);
      if (bannedRef.current) return flashRef.current(tt.hsDeviceBanned);
      if (staleRef.current) return flashRef.current(tt.hsDeviceOffline);

      const proceed = () => {
        // ปิดออโต้เอง = คำสั่งมือเหมือนกัน — ตัวคุมความชื้นต้องไม่เปิดกลับให้ทันที
        noteManualFanCommand(id);
        const ctx = readHsContext();
        if (ctx === null) return flashRef.current(tRef.current.hsSendError);
        // 1) ปิด auto ในอุปกรณ์ก่อน (fire-and-forget · กัน device re-open รีเลย์รอบถัดไป)
        const noAuto: HsCommand = { action: 'setThreshold', channel, mode: 'no-auto' };
        void postHsCommand(ctx, noAuto, newReqId()).catch(() => {});
        // 2) สั่งดับรีเลย์จริง — sendReal ให้ optimistic pending + track reqId + reconcile จาก led + control-log
        sendReal(id, false);
        flashRef.current(tRef.current.hsAutoOffStopped);
      };

      // G2: ปิดพัดลมใหญ่ตัวสุดท้ายตอนร้อน → เตือน+ยืนยัน (เจ้าของเลือก) · ไม่ชน = ทำเลย
      const blocked = guard(id, false, {
        devices: devicesRef.current,
        tank,
        temp: tempRef.current,
        t: tt,
      });
      if (blocked) {
        confirm.ask({
          title: tt.guardWarnTitle,
          body: blocked,
          tone: 'warn',
          confirmLabel: tt.guardProceed,
          run: proceed,
        });
        return;
      }
      proceed();
    },
    [confirm, bondedReject, noteManualFanCommand, sendReal, tank],
  );

  /** ยิงคำสั่ง config (setSchedule) + จับผล — ผู้เรียกต้อง validate + สร้าง cmd ให้ถูกมาก่อน */
  const sendConfigCommand = useCallback(
    (cmd: HsCommand, okMsg: (tt: Dict) => string) => {
      const ctx = readHsContext();
      if (ctx === null) return flashRef.current(tRef.current.hsSendError);
      flashRef.current(tRef.current.hsSending);
      const reqId = newReqId();
      postHsCommand(ctx, cmd, reqId)
        .then(() => tracker.track(reqId))
        .then(() => {
          if (mountedRef.current) flashRef.current(okMsg(tRef.current));
        })
        .catch((e: unknown) => {
          if (!mountedRef.current) return;
          flashRef.current(commandErrorMessage(e, tRef.current));
        });
    },
    [tracker],
  );

  const toHms = (t: string): string => (/^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t);

  /** บันทึกตาราง slot ไปอุปกรณ์ — **โหมด A** (ส่ง days + เวลา) */
  const sendScheduleSave = useCallback(
    (id: DeviceId, cfg: DeviceScheduleSlot) => {
      const tt = tRef.current;
      const channel = channelOf(id);
      if (channel === null) return flashRef.current(tt.hsPumpNotWired);
      if (bondedReject(id)) return;
      if (!realControlRef.current) return flashRef.current(tt.hsNotLive);
      if (bannedRef.current) return flashRef.current(tt.hsDeviceBanned);
      if (staleRef.current) return flashRef.current(tt.hsDeviceOffline);
      const cmd: HsCommand = {
        action: 'setSchedule',
        channel,
        slot: cfg.slot,
        enable: true,
        days: cfg.days,
        startTime: toHms(cfg.startTime),
        endTime: toHms(cfg.endTime),
      };
      const err = validateHsCommand(cmd);
      if (err) {
        const msg =
          err === 'days'
            ? tt.hsScheduleDays
            : err === 'timeEqual' || err === 'timeOrder' || err === 'timeFormat'
              ? tt.hsScheduleTime
              : tt.hsInvalid;
        return flashRef.current(msg);
      }
      sendConfigCommand(cmd, (t2) => t2.hsScheduleOk);
    },
    [bondedReject, sendConfigCommand],
  );

  /**
   * พัก/เปิดใช้ตาราง slot — **โหมด B: ส่ง `enable` อย่างเดียว ห้ามมี `days`**
   * 🔴 นี่คือจุดกันลบตารางถาวร (guide top-5 #3) — สร้าง cmd แบบไม่มี days เด็ดขาด
   */
  const sendScheduleToggle = useCallback(
    (id: DeviceId, slot: number, enable: boolean) => {
      const tt = tRef.current;
      const channel = channelOf(id);
      if (channel === null) return flashRef.current(tt.hsPumpNotWired);
      if (bondedReject(id)) return;
      if (!realControlRef.current) return flashRef.current(tt.hsNotLive);
      if (bannedRef.current) return flashRef.current(tt.hsDeviceBanned);
      if (staleRef.current) return flashRef.current(tt.hsDeviceOffline);
      const cmd: HsCommand = { action: 'setSchedule', channel, slot, enable };
      if (validateHsCommand(cmd)) return flashRef.current(tt.hsInvalid);
      sendConfigCommand(cmd, (t2) => (enable ? t2.hsScheduleResumed : t2.hsSchedulePaused));
    },
    [bondedReject, sendConfigCommand],
  );

  /**
   * ลบตาราง slot ออกจากอุปกรณ์ถาวร — **โหมด A แบบไม่ติ๊กวันเลย + enable:false** = อุปกรณ์ลบทิ้ง (guide §6.3)
   * 🔴 กู้กลับไม่ได้ — หน้าจอต้องถามยืนยันก่อนเรียก (ต่างจาก pause ที่แค่หยุดชั่วคราว)
   */
  const sendScheduleDelete = useCallback(
    (id: DeviceId, slot: number) => {
      const tt = tRef.current;
      const channel = channelOf(id);
      if (channel === null) return flashRef.current(tt.hsPumpNotWired);
      if (bondedReject(id)) return;
      if (!realControlRef.current) return flashRef.current(tt.hsNotLive);
      if (bannedRef.current) return flashRef.current(tt.hsDeviceBanned);
      if (staleRef.current) return flashRef.current(tt.hsDeviceOffline);
      const NO_DAYS: HsDays = {
        mon: false,
        tue: false,
        wed: false,
        thu: false,
        fri: false,
        sat: false,
        sun: false,
      };
      const cmd: HsCommand = { action: 'setSchedule', channel, slot, enable: false, days: NO_DAYS };
      if (validateHsCommand(cmd)) return flashRef.current(tt.hsInvalid);
      sendConfigCommand(cmd, (t2) => t2.hsScheduleDeleted);
    },
    [bondedReject, sendConfigCommand],
  );

  const toggleAuto = useCallback(
    (id: DeviceId) => {
      const tt = tRef.current;
      const d = devicesRef.current.find((x) => x.id === id);
      if (!d) return;
      const name = deviceName(d, tt);
      if (!d.online) return flash(tt.offlineMode(name));
      const next = !d.auto;
      // ผ่าน setMode เพื่อให้โหมดของหน้าโรงเรือนขยับตามด้วย ไม่งั้นสองหน้าบอกคนละอย่าง
      setMode(id, next ? 'auto' : 'manual');
      addLog(tt.logMode(name, next ? tt.modeAutoFull : tt.modeManualFull));
    },
    [addLog, flash, setMode],
  );

  return {
    devices,
    estop,
    tank,
    log,
    justDone,
    busy: devices.some((d) => d.pending != null),
    press,
    toggleAuto,
    realControl,
    estopPress,
    addLog,
    watering,
    waterAll,
    sendThreshold,
    disableTempAuto,
    sendScheduleSave,
    sendScheduleToggle,
    sendScheduleDelete,
  };
}
