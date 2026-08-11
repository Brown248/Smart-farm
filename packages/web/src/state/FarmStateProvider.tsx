import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { ClimateValues } from '@shared/sensor';
import type { AlarmRecord } from '@shared/telemetrySocket';
import { telemetryBoolean, telemetryNumber } from '@shared/telemetrySocket';
import { ZONE_IDS } from '@shared/zone';
import { deviceRunning } from '@shared/device';
import type { Device, DeviceId } from '@shared/device';
import { BIG_FAN_LOCK_TEMP } from '@shared/thresholds';
import type { SceneZone } from '@shared/zone';
import { HS_CHANNELS, HS_TEST_CHANNEL, type HsChannel } from '@shared/handysense';
import { CHANNEL_BY_DEVICE, channelOf } from '@/config/deviceChannels';
import {
  HS_ATTRIBUTE_KEYS,
  readChannelState,
  readShadowTs,
  type Attributes,
  type HsChannelState,
} from '@/config/deviceAttributes';
import { ZONE_GEOMETRY } from '@/data/zones';
import { INITIAL_DEVICES, INITIAL_LOG, INITIAL_TANK_PCT } from '@/data/devices';
import type { LogEntry } from '@/data/devices';
import { hhmm } from '@/lib/format';
import {
  DEVICE_STALE_MS,
  HUM_TICK_MS,
  LED_CONFIRM_TIMEOUT_MS,
  LOG_LIMIT,
  PUMP_CUTOFF_MS,
  SENSOR_STALE_MS,
  SEND_LATENCY_MS,
} from '@/lib/deviceTiming';
import { newReqId, postHsCommand, readHsContext } from '@/services/handysenseControl';
import {
  INITIAL_VENT_STATE,
  inTimeWindow,
  nextVent,
  type VentStage,
  type VentState,
} from '@/lib/humidityVent';
import { DEFAULT_THRESHOLDS } from '@/data/dashboard';
import type { SensorKey, Threshold } from '@/data/dashboard';
import { DEFAULT_WATERING_CONFIG, NOTIF_TOGGLE_KEYS } from '@/data/irrigation';
import type { NotifToggleKey, WateringConfig, ZoneSettings } from '@/data/irrigation';
import {
  DEFAULT_DEVICE_SCHEDULES,
  DEFAULT_FAN_THRESHOLDS,
  DEFAULT_HUMIDITY_AUTO,
} from '@/data/greenhouse';
import type { DeviceScheduleSlot, FanTempThreshold, HumidityAuto } from '@/data/greenhouse';
import { ACTIVITY_LOG_LIMIT, type DashLogEntry } from '@/data/mockActivityLog';
import { GH_DEVICES } from '@/data/greenhouse';
import type { GhMode } from '@/data/greenhouse';
import {
  CLIMATE_DRIFT,
  CLIMATE_TICK_MS,
  INITIAL_CLIMATE,
  INITIAL_ZONE_STATE,
  SOIL_DRIFT,
} from '@/data/mockClimate';
import {
  LIVE_FIELDS,
  resolveClimate,
  resolveSoil,
  soilKey,
  unmatchedKeys,
  type LiveField,
} from '@/config/telemetryKeys';
import { readCommandResult, type CommandResult } from '@/config/commandResult';
import { soilToZoneStatus } from '@/data/zoneSoil';
import { useTelemetry, type ConnectionStatus } from '@/hooks/useTelemetry';
import { reportDeviceFreshness, reportLiveCoverage } from '@/state/liveStatus';
import { clamp } from '@/lib/format';

/**
 * ที่มาของค่าบนหน้าจอ — ให้หน้าเพจติดป้ายได้ว่าเลขไหนของจริง เลขไหนยังจำลอง
 *
 * มีค่าจริงบางตัวแล้วปนกับค่าจำลองเงียบๆ คือบั๊กตระกูลเดียวกับที่ไล่กวาดมาทั้งโปรเจกต์
 * (แหล่งข้อมูลหลายชุดโดยไม่มีใครรู้ว่าอันไหนจริง) — ต้องบอกให้เห็น
 */
export interface LiveInfo {
  readonly status: ConnectionStatus;
  /** ค่าที่มาจากเซนเซอร์จริงในรอบนี้ — ที่ไม่อยู่ในนี้คือค่าจำลอง */
  readonly fields: ReadonlySet<LiveField>;
  /**
   * ส่วนย่อยของ `fields` ที่ **หยุดอัปเดตไปแล้ว** (ดู `SENSOR_STALE_MS`) — ค่ายังโชว์อยู่แต่เป็นค่าค้าง
   *
   * แยกจาก `fields` โดยตั้งใจ: ค่านี้ยัง "มาจากเซนเซอร์จริง" อยู่ จึงยังต้องทับค่าจำลอง
   * (สลับกลับไปเป็นเลขจำลองที่ขยับได้ = หลอกกว่าเดิม) แต่ต้องเลิกเรียกว่า "ค่าจริง"
   * และเลิกนับในป้าย "ค่าจริง x/5"
   */
  readonly stale: ReadonlySet<LiveField>;
  /**
   * ค่าหน้าจอ → **ชื่อ key จริงที่ device ใช้** เช่น `{ temp: 'temperature' }`
   * เอาไปแสดงในแผง dev ได้ว่าจับคู่กับตัวไหน — จำเป็นตอนตั้งค่าครั้งแรก
   */
  readonly matched: Readonly<Partial<Record<LiveField, string>>>;
  /** ms epoch ของข้อมูลล่าสุด — `null` = ยังไม่เคยได้เลย */
  readonly updatedAt: number | null;
  readonly error: string | null;
  /** key ที่ device ส่งมาแต่ยังจับคู่ไม่ได้ — เอาไปตั้ง alias เพิ่มได้ */
  readonly unmatched: readonly string[];
  /**
   * ค่าจริงล่าสุดไม่เกิน 8 จุดของแต่ละค่า — ใช้วาดเส้นแนวโน้มย่อในการ์ด
   *
   * ต้องมีเพราะเส้นแนวโน้มในต้นแบบเป็นตัวเลขฝังไว้ 8 ตัว ถ้าการ์ดติดป้าย "ค่าจริง"
   * แต่เส้นใต้เลขยังเป็นของปลอม ก็เท่ากับโกหกครึ่งใบ
   * เก็บจากค่าที่ไหลเข้ามาเอง ไม่ต้องรอ `history` จาก server (ซึ่งต้องรู้ชื่อ key ก่อน)
   */
  readonly trail: Readonly<Partial<Record<LiveField, readonly number[]>>>;
  /**
   * ผลตอบกลับคำสั่งล่าสุดจากอุปกรณ์ (`cmd_result`) — `null` ถ้ายังไม่มี
   * บอกว่าช่องสั่งงานอุปกรณ์ยังตอบสนองไหม และคำสั่งล่าสุดสำเร็จหรือไม่
   */
  readonly command: CommandResult | null;
  /**
   * แจ้งเตือนจาก backend (`alarm_data`/`alarm_update`) — กฎแจ้งเตือนที่ตั้งใน ThingsBoard
   * เป็นแจ้งเตือน "ทางการ" ที่สุด · ว่างเมื่อยังไม่มีใครตั้ง rule (ปกติตอนนี้)
   */
  readonly alarms: readonly AlarmRecord[];
}

/**
 * สถานะกลางของโรงเรือน — **แหล่งข้อมูลเดียวของทั้งระบบ**
 *
 * ก่อนหน้านี้แต่ละหน้าเก็บของตัวเอง: ฉากเกมเห็นปั๊มเปิด หน้าโรงเรือนเห็นปั๊มปิด
 * Emergency Stop มีเจ้าของ 3 ที่ กดที่หน้าหนึ่งอีกหน้าไม่รู้เรื่อง
 * และอุณหภูมิเป็นคนละค่า 3 ค่า ทำให้ guard G2 ตัดสินไม่เหมือนกันตามหน้าที่เปิดอยู่
 *
 * เฟส 5: provider นี้เป็นที่เดียวที่ subscribe telemetry จริง ค่าที่จับคู่ได้ทับค่าจำลอง
 * หน้าอื่นไม่ต้องแก้อะไร — แค่เพิ่ม `live` ให้ดูได้ว่าเลขไหนเป็นของจริง
 */
export interface FarmState {
  /**
   * ค่าอากาศที่ทุกหน้าต้องเห็นเหมือนกัน
   * ค่าไหนมีเซนเซอร์จริงใช้ของจริง ที่ยังไม่มีใช้ค่าจำลองเดินทุก 3.2 วินาทีตามเดิม
   * ดูว่าตัวไหนเป็นของจริงได้จาก `live.fields`
   */
  readonly climate: ClimateValues;
  readonly zones: readonly SceneZone[];

  /** อุปกรณ์จริง 5 ตัว */
  readonly devices: readonly Device[];
  readonly setDevices: Dispatch<SetStateAction<readonly Device[]>>;
  /** โหมดของหน้าควบคุมโรงเรือน (มือ/อัตโนมัติ/ตั้งเวลา) — คู่กับ `Device.auto` */
  readonly modes: Readonly<Record<DeviceId, GhMode>>;
  readonly setMode: (id: DeviceId, mode: GhMode) => void;

  /** หยุดฉุกเฉิน — ต้องมีตัวเดียวทั้งระบบ ไม่งั้นกดที่หน้าหนึ่งแล้วอีกหน้ายังสั่งได้ */
  readonly estop: boolean;
  readonly setEstop: Dispatch<SetStateAction<boolean>>;
  /**
   * หยุดฉุกเฉินติดอยู่ แต่อุปกรณ์เหล่านี้ยังรายงานว่าทำงานอยู่ (`led=true`) — ว่างเมื่อทุกอย่างหยุดจริง
   * ทุกหน้าที่แสดงสถานะ estop ต้องเตือนแรงเมื่อไม่ว่าง (อ่านจากที่นี่ที่เดียว ห้ามคำนวณเอง)
   */
  readonly estopDefied: readonly DeviceId[];

  /**
   * เวลาที่ระบบจะปิดปั๊มเอง (epoch ms) — `null` = ไม่ได้นับอยู่
   *
   * ตัวนับเริ่มจาก **`led` ที่อุปกรณ์รายงานว่าปั๊มเดิน** ไม่ใช่จาก "เว็บเราสั่งเปิด"
   * เปิดจากแอป HandySense หรือจากตารางเวลาก็โดนตัดเหมือนกัน — จงใจให้เป็นแบบนี้
   * แต่ **ต้องบอกผู้ใช้ล่วงหน้าเสมอ** ไม่งั้นปั๊มดับเองแล้วผู้ใช้หาสาเหตุไม่เจอ (เจ้าของงานเจอจริง 2026-08-10)
   */
  readonly pumpCutoffAt: number | null;
  /** เพิ่มขึ้น 1 ทุกครั้งที่ระบบตัดปั๊มจริง — หน้าเพจใช้เป็นสัญญาณเด้ง toast (ดู `usePumpCutoffToast`) */
  readonly pumpCutoffCount: number;

  readonly tank: number;
  readonly log: readonly LogEntry[];
  readonly setLog: Dispatch<SetStateAction<readonly LogEntry[]>>;

  readonly thresholds: Readonly<Record<SensorKey, Threshold>>;
  readonly setThreshold: (key: SensorKey, next: Threshold) => void;

  /** หมวดแจ้งเตือนที่ผู้ใช้เปิด/ปิด — ของทั้งฟาร์ม `useFarmAlerts` กรองตามนี้ */
  readonly notifPrefs: Readonly<Record<NotifToggleKey, boolean>>;
  readonly toggleNotif: (key: NotifToggleKey) => void;

  /** เกณฑ์อุณหภูมิอัตโนมัติรายอุปกรณ์ (ส่งเป็น HandySense setThreshold) — persist ข้ามหน้า */
  readonly deviceThresholds: Readonly<Record<DeviceId, FanTempThreshold>>;
  readonly setDeviceThreshold: (id: DeviceId, patch: Partial<FanTempThreshold>) => void;
  /** ตารางเวลารายอุปกรณ์ (slot · ส่งเป็น HandySense setSchedule) — persist ข้ามหน้า */
  readonly deviceSchedules: Readonly<Record<DeviceId, readonly DeviceScheduleSlot[]>>;
  readonly setDeviceSchedule: (id: DeviceId, slots: readonly DeviceScheduleSlot[]) => void;

  /** ค่าตั้งรดน้ำของทั้งฟาร์ม (สวิตช์อัตโนมัติ + โหมด + กติกา) — persist ข้ามหน้า */
  readonly wateringConfig: WateringConfig;
  readonly updateWatering: (patch: Partial<WateringConfig>) => void;

  /**
   * ข้อมูลแปลงที่ผู้ใช้ตั้งเอง (ชื่อ · พืช · พื้นที่ · เป้าหมาย) — key คือตัวอักษรโซน A–H
   * เก็บเฉพาะแปลงที่ตั้งจริง ที่เหลือ fallback เป็น "โซน X" ที่หน้าจอ (provider ไม่รู้จัก i18n)
   *
   * เคยเป็น state ของหน้าชลประทาน → กดบันทึกแล้วขึ้นว่าบันทึกแล้ว แต่เปลี่ยนหน้ากลับมาหายหมด
   */
  readonly zoneSettings: Readonly<Record<string, ZoneSettings>>;
  readonly setZoneSettings: (letter: string, next: ZoneSettings) => void;

  /** ควบคุมความชื้นด้วยพัดลมดูด (แอปสั่งเองตาม RH · ประหยัดไฟ) — ของทั้งฟาร์ม */
  readonly humidityAuto: HumidityAuto;
  readonly setHumidityAuto: (patch: Partial<HumidityAuto>) => void;
  /** สถานะการดูดปัจจุบัน (0 ปิด · 1 ใหญ่#1 · 2 ใหญ่#1+#2) — โชว์บน UI อ่านอย่างเดียว */
  readonly humidityVentStage: 0 | 1 | 2;
  /**
   * พัดลมที่ **ตัวคุมความชื้นกำลังคุมอยู่จริง** — ติดป้ายบนการ์ดให้ผู้ใช้รู้ว่าใครสั่ง
   * ตัวที่ผู้ใช้สั่งเองในรอบนี้จะหลุดออกจากรายการ (ผู้ใช้ชนะจนกว่ารอบดูดจะจบ)
   */
  readonly ventOwned: readonly DeviceId[];
  /**
   * ผู้ใช้กดปั๊มเองอยู่ตอนนี้ไหม — ตัวตามพัดลมหยุดคุมชั่วคราว
   * ใช้ติดป้ายบนการ์ดว่า "คุมด้วยมือ" และเป็นเงื่อนไขเดียวที่ auto-cutoff จะเริ่มนับ
   */
  readonly pumpManual: boolean;
  /**
   * สลับโหมดปั๊มคูลลิ่งแพดด้วยตัวเอง — `'auto'` = คืนสิทธิ์ให้ตัวตามพัดลมใหญ่ **ทันที**
   *
   * 🔴 `'auto'` ของปั๊มคือ "เดินตามพัดลมใหญ่" เท่านั้น **ไม่ใช่**เกณฑ์เซนเซอร์หรือตารางเวลาของตัวเอง
   * (ปั๊มเดินตอนพัดลมไม่เดิน = น้ำไหลผ่านแผงทิ้งเปล่า ไม่ได้ลดอุณหภูมิอะไรเลย)
   *
   * เดิมกลับไปอัตโนมัติได้ทางเดียวคือ "รอจนสถานะพัดลมเปลี่ยนเอง" ซึ่งผู้ใช้กดเองไม่ได้
   */
  readonly setPumpMode: (mode: 'auto' | 'manual') => void;
  /**
   * แจ้งว่า "ผู้ใช้สั่งพัดลมตัวนี้เอง" — `useDeviceCommand` เรียกให้ทุกครั้งที่มีคำสั่งมือ
   * ตัวคุมความชื้นจะไม่ทับพัดลมตัวนั้นจนกว่ารอบดูดปัจจุบันจะจบ
   */
  readonly noteManualCommand: (id: DeviceId) => void;

  /** สมุดบันทึกกิจกรรม (แดชบอร์ด) — เริ่มว่าง · เพิ่มแล้วอยู่รอดข้ามหน้า */
  readonly activityLogs: readonly DashLogEntry[];
  readonly addActivityLog: (entry: DashLogEntry) => void;

  /** ข้อมูลสดมาจริงแค่ไหน — ใช้ติดป้ายบนหน้าจอ ไม่ใช้ตัดสินใจเรื่องความปลอดภัย */
  readonly live: LiveInfo;

  /**
   * โหมดควบคุมจริง (HandySense) เปิดอยู่ไหม = ต่อ backend จริงและ auth ผ่านแล้ว (status 'live')
   * เมื่อ `true` การกดสวิตช์จะยิงคำสั่งจริง และ `Device.on` มาจาก `led{channel}` จริง
   * เมื่อ `false` (mock/ยังไม่ล็อกอิน) ทุกอย่างเป็นจำลองเหมือนเดิม
   */
  readonly realControl: boolean;
  /**
   * สถานะจริงรายช่องจาก attributes (`led`·เกณฑ์·ตารางเวลา·mode) — `null` เมื่อไม่ใช่โหมดจริง
   * ใช้โชว์ว่าช่องไหนมี automation อยู่ (กดแล้วอาจถูกทับ) และเติมฟอร์มเงื่อนไข
   */
  readonly channelStates: Readonly<Partial<Record<HsChannel, HsChannelState>>> | null;
}

const FarmContext = createContext<FarmState | null>(null);

/** จำนวนจุดของเส้นแนวโน้มย่อในการ์ดเซนเซอร์ — ตรงกับ `SensorDef.spark` ของต้นแบบ */
const TRAIL_POINTS = 8;

/** array ว่างตัวเดียวใช้ร่วมกัน — คืน `[]` ใหม่ทุกครั้งจะทำให้ผู้ใช้ context re-render เปล่าๆ */
const NO_DEVICES: readonly DeviceId[] = [];

function initialZones(): SceneZone[] {
  return ZONE_IDS.map((id) => ({
    id,
    box: ZONE_GEOMETRY[id].box,
    dot: ZONE_GEOMETRY[id].dot,
    soil: INITIAL_ZONE_STATE[id].soil,
    status: INITIAL_ZONE_STATE[id].status,
  }));
}

/** โหมดเริ่มต้นของแต่ละอุปกรณ์ — ให้ตรงกับ `Device.auto` ของฉากเกม */
function initialModes(): Record<DeviceId, GhMode> {
  const byId = new Map(GH_DEVICES.map((d) => [d.id, d.mode]));
  const out = {} as Record<DeviceId, GhMode>;
  for (const d of INITIAL_DEVICES) {
    // ถ้าอุปกรณ์ตั้ง auto อยู่ ให้เป็นโหมดอัตโนมัติ ไม่งั้นใช้โหมดที่หน้าโรงเรือนกำหนดไว้
    out[d.id] = d.auto ? 'auto' : (byId.get(d.id) ?? 'manual');
  }
  return out;
}

/**
 * `initialDevices` เป็น seam สำหรับเทสเท่านั้น (เช่น จำลองอุปกรณ์ออฟไลน์)
 * แอปจริงไม่ส่งค่านี้ → ใช้ `INITIAL_DEVICES` เสมอ · ไม่กระทบสถาปัตยกรรม single-source
 */
export function FarmStateProvider({
  children,
  initialDevices = INITIAL_DEVICES,
  forceRealControl,
  forceAttributes,
}: {
  children: ReactNode;
  initialDevices?: readonly Device[];
  /** seam สำหรับเทสเท่านั้น — บังคับโหมดควบคุมจริง โดยไม่ต้องต่อ backend จริง */
  forceRealControl?: boolean;
  /** seam สำหรับเทสเท่านั้น — ฉีด attributes จริง (led/เกณฑ์) โดยไม่ต้องต่อ backend */
  forceAttributes?: Attributes;
}) {
  const [simClimate, setClimate] = useState<ClimateValues>(INITIAL_CLIMATE);
  const [baseZones, setBaseZones] = useState<readonly SceneZone[]>(initialZones);
  const [devices, setDevices] = useState<readonly Device[]>(initialDevices);
  const [modes, setModes] = useState<Record<DeviceId, GhMode>>(initialModes);
  const [estop, setEstop] = useState(false);
  const [log, setLog] = useState<readonly LogEntry[]>(INITIAL_LOG);
  const [thresholds, setThresholds] =
    useState<Readonly<Record<SensorKey, Threshold>>>(DEFAULT_THRESHOLDS);
  // หมวดแจ้งเตือนเปิดครบทุกหมวดเป็นค่าเริ่มต้น — ผู้ใช้ปิดที่ลิ้นชักโซนได้ (ของทั้งฟาร์ม)
  const [notifPrefs, setNotifPrefs] = useState<Readonly<Record<NotifToggleKey, boolean>>>(
    () =>
      Object.fromEntries(NOTIF_TOGGLE_KEYS.map((k) => [k, true])) as Record<
        NotifToggleKey,
        boolean
      >,
  );
  const toggleNotif = useCallback((key: NotifToggleKey) => {
    setNotifPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  // เกณฑ์อุณหภูมิอัตโนมัติรายอุปกรณ์ (โรงเรือน) — เก็บที่ provider ให้อยู่รอดข้ามหน้า
  const [deviceThresholds, setThresholdsState] = useState<Record<DeviceId, FanTempThreshold>>(
    () => ({
      ...DEFAULT_FAN_THRESHOLDS,
    }),
  );
  const setDeviceThreshold = useCallback((id: DeviceId, patch: Partial<FanTempThreshold>) => {
    setThresholdsState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);
  const [deviceSchedules, setSchedulesState] = useState<
    Record<DeviceId, readonly DeviceScheduleSlot[]>
  >(() => ({ ...DEFAULT_DEVICE_SCHEDULES }));
  const setDeviceSchedule = useCallback((id: DeviceId, slots: readonly DeviceScheduleSlot[]) => {
    setSchedulesState((prev) => ({ ...prev, [id]: slots }));
  }, []);
  const [wateringConfig, setWateringConfig] = useState<WateringConfig>(DEFAULT_WATERING_CONFIG);
  const updateWatering = useCallback((patch: Partial<WateringConfig>) => {
    setWateringConfig((prev) => ({ ...prev, ...patch }));
  }, []);
  // ข้อมูลแปลงที่ผู้ใช้ตั้งเอง — เริ่มว่าง เก็บเฉพาะแปลงที่ตั้งจริง (ที่เหลือใช้ชื่อเริ่มต้นของหน้าจอ)
  const [zoneSettings, setZoneSettingsState] = useState<Readonly<Record<string, ZoneSettings>>>({});
  const setZoneSettings = useCallback((letter: string, next: ZoneSettings) => {
    setZoneSettingsState((prev) => ({ ...prev, [letter]: next }));
  }, []);
  // ควบคุมความชื้นด้วยพัดลมดูด (แอปสั่งเองตาม RH) — ค่าตั้ง + สถานะการดูดปัจจุบัน
  const [humidityAuto, setHumidityAutoState] = useState<HumidityAuto>(DEFAULT_HUMIDITY_AUTO);
  const setHumidityAuto = useCallback((patch: Partial<HumidityAuto>) => {
    setHumidityAutoState((prev) => ({ ...prev, ...patch }));
  }, []);
  const [humidityVentStage, setHumidityVentStage] = useState<VentStage>(0);
  // สมุดบันทึกเริ่มว่าง (empty state) — ไม่ seed รายการปลอม · เพิ่มเองแล้วอยู่ข้ามหน้า
  const [activityLogs, setActivityLogs] = useState<readonly DashLogEntry[]>([]);
  const addActivityLog = useCallback((entry: DashLogEntry) => {
    // จำกัดเพดานเหมือน control log — ไม่งั้นแท็บเล็ตที่เปิดค้างทั้งสัปดาห์จะสะสมไม่รู้จบ
    setActivityLogs((prev) => [entry, ...prev].slice(0, ACTIVITY_LOG_LIMIT));
  }, []);

  /**
   * ข้อมูลสดจาก backend — **subscribe ที่นี่ที่เดียวทั้งแอป**
   *
   * ไม่ส่ง `keys` โดยตั้งใจ = ขอทุก key ที่ device ยิงมา แล้วค่อยจับคู่ชื่อจากที่มาจริง
   * เอกสารเตือนว่าขอ key ที่สะกดผิดจะ**ไม่ error แต่ไม่มีอะไรส่งมาเลย** ซึ่งหน้าตา
   * เหมือน device ตายสนิท แยกไม่ออก — ขอทั้งหมดแล้วจับคู่จึงเห็นปัญหาได้จริง
   *
   * ไม่ขอ `history` ที่นี่เพราะ provider ไม่ได้ใช้ ใครอยากได้กราฟย้อนหลังให้เรียก
   * `useTelemetry` เองพร้อม `keys` ที่รู้ชื่อแล้ว (`history` บังคับต้องระบุ keys)
   */
  // ต้องระบุ attributeKeys (led/เกณฑ์/timer) ไม่งั้น backend ไม่ส่ง attribute มาเลย →
  // สถานะจริงของอุปกรณ์ (led→on · mode · เกณฑ์) จะว่าง แล้วจอค้างที่ค่า mock
  const telemetry = useTelemetry({
    subscribeAlarms: true,
    attributeKeys: HS_ATTRIBUTE_KEYS,
    attributeScope: 'SHARED_SCOPE',
  });

  /** จับคู่ชื่อ key ที่ไหลมา → ค่าที่หน้าจอใช้ */
  const resolved = useMemo(() => resolveClimate(telemetry.live), [telemetry.live]);
  const liveSoil = useMemo(() => resolveSoil(telemetry.live), [telemetry.live]);

  /** ค่าจริงทับค่าจำลองเฉพาะตัวที่มีเซนเซอร์ ที่เหลือยังเดินจำลองตามเดิม */
  const climate = useMemo<ClimateValues>(
    () => ({ ...simClimate, ...resolved.values }),
    [simClimate, resolved],
  );

  const liveFields = useMemo<ReadonlySet<LiveField>>(() => {
    const set = new Set<LiveField>(Object.keys(resolved.values) as LiveField[]);
    if (liveSoil !== null) set.add('soil');
    return set;
  }, [resolved, liveSoil]);

  const unmatched = useMemo(() => unmatchedKeys(telemetry.live), [telemetry.live]);

  /** ผลตอบกลับคำสั่งล่าสุดจากอุปกรณ์ — `cmd_result` มาผ่าน discovery stream อยู่แล้ว */
  const command = useMemo(() => readCommandResult(telemetry.live), [telemetry.live]);

  /** โหมดควบคุมจริง (HandySense) — ต่อจริง + auth ผ่าน (status 'live') · seam เทสบังคับได้ */
  const realControl = forceRealControl ?? telemetry.connectionStatus === 'live';
  /** attributes จริง (`led`·เกณฑ์·timer) · seam `forceAttributes` ให้เทสฉีดได้โดยไม่ต้องต่อ backend */
  const attributes = forceAttributes ?? telemetry.attributes;
  /** สถานะจริงรายช่อง (ch0-2 · ch3 test) จาก attributes — คำนวณเฉพาะโหมดจริง */
  const channelStates = useMemo<Readonly<Partial<Record<HsChannel, HsChannelState>>> | null>(() => {
    if (!realControl) return null;
    const out: Partial<Record<HsChannel, HsChannelState>> = {};
    for (const ch of HS_CHANNELS) out[ch] = readChannelState(attributes, ch);
    return out;
  }, [realControl, attributes]);

  /**
   * โหมดจริง: sync `Device.on` (จาก `led{channel}`) และ `Device.auto` (จาก mode จริง = มีเกณฑ์ไหม)
   * ให้ตรงกับอุปกรณ์จริง — ไม่ใช่คำสั่งที่เพิ่งส่ง (กฎ #2 · guide ข้อ 7) · ทั้งหน้าโรงเรือนและแผงเกม
   * อ่านจากชุดเดียวกันจึงตรงกัน · เคลียร์ pending เมื่อ led **เปลี่ยนค่าจริง** (ยืนยันแล้ว)
   *
   * ⚠️ **ห้ามข้ามตอน estop** — ของเดิมข้าม ทำให้จอค้างที่ "ปิดหมด" ตลอดไป
   * ทั้งที่ของจริงอาจยังหมุนอยู่ (automation ในอุปกรณ์เปิดกลับ) = แอปโกหกในจังหวะที่อันตรายที่สุด
   * ตอนนี้ estop ปิดเกณฑ์ในอุปกรณ์ให้แล้ว (`useEstop`) และถ้ายังไม่หยุดจริง `estopDefied` จะเตือนแรง
   */
  useEffect(() => {
    if (!realControl || channelStates === null) return;
    setDevices((prev) => {
      let changed = false;
      const next = prev.map((d) => {
        const ch = channelOf(d.id);
        if (ch === null) return d;
        const st = channelStates[ch];
        if (!st) return d;
        const led = st.on; // boolean | null (null = ยังไม่ได้ค่า)
        const auto = st.mode === 'auto';
        const ledChanged = led !== null && led !== d.on;
        const nextOn = led === null ? d.on : led;
        if (d.on === nextOn && d.auto === auto && !ledChanged) return d;
        changed = true;
        return { ...d, on: nextOn, auto, pending: ledChanged ? null : d.pending };
      });
      return changed ? next : prev;
    });
    // `modes` ต้องเดินคู่กับ `Device.auto` เสมอ (setMode ทำแบบนี้อยู่แล้ว) — ถ้า reconcile
    // แก้แต่ `Device.auto` ไม่แตะ `modes` สองค่าจะขัดกันถาวร แล้วคนอ่าน `modes` จะโกหก
    setModes((prev) => {
      let changed = false;
      const next: Record<DeviceId, GhMode> = { ...prev };
      for (const id of Object.keys(CHANNEL_BY_DEVICE) as DeviceId[]) {
        const ch = CHANNEL_BY_DEVICE[id];
        if (ch === null) continue;
        const st = channelStates[ch];
        if (!st) continue;
        const mode: GhMode = st.mode === 'auto' ? 'auto' : 'manual';
        if (next[id] !== mode) {
          next[id] = mode;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [realControl, channelStates]);

  /**
   * ช่วงผ่อนผันหลังกด estop — อุปกรณ์รายงาน `led` ทุก ~10 วิ และเปลี่ยนตามจริง ~8-9 วิ
   * ถ้าไม่รอ จะขึ้นเตือน "อุปกรณ์ไม่ยอมหยุด" ทันทีทุกครั้งที่กด ทั้งที่เป็นเรื่องปกติ
   * → คำเตือนที่ขึ้นทุกครั้งคือคำเตือนที่ไม่มีใครอ่าน ต้องขึ้นเฉพาะตอนผิดปกติจริงเท่านั้น
   */
  const [estopGraceOver, setEstopGraceOver] = useState(false);
  useEffect(() => {
    setEstopGraceOver(false);
    if (!estop) return;
    const id = window.setTimeout(() => setEstopGraceOver(true), LED_CONFIRM_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [estop]);

  /**
   * กด estop แล้วผ่านช่วงผ่อนผันไปแล้ว แต่ยังมีช่องที่รายงาน `led=true` = **อุปกรณ์ไม่ยอมหยุด**
   *
   * ต้องเตือนแรง ไม่ใช่ซ่อน — ผู้ใช้กดหยุดฉุกเฉินแล้วเดินจากไปโดยเชื่อว่าปลอดภัย
   * คือสถานการณ์ที่แย่ที่สุดที่แอปนี้ทำให้เกิดได้
   */
  const estopDefied = useMemo<readonly DeviceId[]>(() => {
    if (!estop || !estopGraceOver || !realControl || channelStates === null) return NO_DEVICES;
    const out: DeviceId[] = [];
    for (const id of Object.keys(CHANNEL_BY_DEVICE) as DeviceId[]) {
      const ch = CHANNEL_BY_DEVICE[id];
      // ตัวพ่วง (พัดลมเล็ก) ใช้ช่องเดียวกับตัวหลัก — ขึ้นทั้งคู่โดยตั้งใจ เพราะของจริงหมุนทั้งคู่
      if (ch !== null && channelStates[ch]?.on === true) out.push(id);
    }
    return out.length > 0 ? out : NO_DEVICES;
  }, [estop, estopGraceOver, realControl, channelStates]);

  /**
   * ตาข่ายชั้นสอง: ยิง `setSwitch off` ซ้ำ **ครั้งเดียวต่อช่อง ต่อรอบ estop**
   *
   * เผื่อคำสั่งแรกหล่นหาย — แต่ **ห้ามยิงวนไม่จบ** ถ้ายิงซ้ำแล้วยังไม่หยุด แปลว่าเป็นปัญหา
   * ฮาร์ดแวร์หรือมีตัวควบคุมอื่นสั่งอยู่ ต้องให้คนไปจัดการหน้างาน การ retry ไม่รู้จบจะกลบอาการเสียจริง
   */
  const estopRetryRef = useRef<Set<HsChannel>>(new Set());
  useEffect(() => {
    if (!estop) {
      estopRetryRef.current.clear();
      return;
    }
    // รอให้พ้นช่วงผ่อนผันก่อน — ยิงซ้ำทันทีไม่มีประโยชน์ อุปกรณ์ยังไม่ทันประมวลผลคำสั่งแรกด้วยซ้ำ
    if (!estopGraceOver || !realControl || channelStates === null) return;
    const ctx = readHsContext();
    if (ctx === null) return;
    for (const ch of HS_CHANNELS) {
      if (ch === HS_TEST_CHANNEL) continue;
      if (channelStates[ch]?.on !== true || estopRetryRef.current.has(ch)) continue;
      estopRetryRef.current.add(ch);
      void postHsCommand(ctx, { action: 'setSwitch', channel: ch, on: false }, newReqId()).catch(
        () => {},
      );
    }
  }, [estop, estopGraceOver, realControl, channelStates]);

  /** จับคู่ค่าหน้าจอกับชื่อ key จริง — รวมความชื้นดินที่อยู่นอก `resolveClimate` */
  const matched = useMemo<Readonly<Partial<Record<LiveField, string>>>>(() => {
    const soil = soilKey(telemetry.live);
    return soil === null ? resolved.matched : { ...resolved.matched, soil };
  }, [resolved, telemetry.live]);

  /**
   * ── ค่าค้าง**รายเซนเซอร์** ──
   *
   * 🔴 `deviceStale` (shadow_ts) จับได้แค่ "ทั้งบอร์ดเงียบ" · บอร์ดที่ยังส่ง shadow_ts ปกติ
   * แต่มีเซนเซอร์ตัวหนึ่งถูกถอดสายออก จะไม่มีอะไรฟ้องเลย — `live.fields` ยังนับว่าเป็นค่าจริง
   * (เกิดจริง 2026-08-11 กับเซนเซอร์ความชื้นดิน · ดู `SENSOR_STALE_MS`)
   *
   * `timestamp` รายค่ามากับ payload อยู่แล้วตั้งแต่แรก แต่ทั้งระบบไม่เคยมีใครใช้เลย
   *
   * 🔴 **เทียบ `timestamp` ของค่าต่างๆ กันเองเท่านั้น ห้ามเอานาฬิกาเรือนอื่นมาปน**
   *
   * เคยพลาดมาแล้ว (เจ้าของงานเจอบนหน้าจอจริง 2026-08-11): เดิมเอา `telemetry.lastUpdateAt`
   * มาร่วมหา "ค่าที่ใหม่ที่สุด" ด้วย — แต่ตัวนั้นคือ `Date.now()` ของ **เบราว์เซอร์**
   * ส่วน `timestamp` รายค่ามาจากนาฬิกาของ **อุปกรณ์/เซิร์ฟเวอร์**
   * พอสองเรือนเหลื่อมกันเกิน 5 นาที (หรือคนละหน่วย) ทุกค่าจะถูกหาว่าค่าค้างพร้อมกันหมด
   * ทั้งที่ตัวเลขบนจอยังขยับอยู่ → ป้ายบน header ขึ้น "ค่าค้างทั้งหมด" แบบผิดๆ
   *
   * เทียบกันเองในสตรีมคือภูมิคุ้มกัน clock skew เพราะทุกค่ามาจากนาฬิกาเรือนเดียวกัน
   * ผลข้างเคียงที่ยอมรับ: ค่าที่ใหม่ที่สุดจะไม่มีวันถูกหาว่าค้าง → **อย่างน้อยหนึ่งค่าสดเสมอ**
   * เคส "เงียบพร้อมกันหมด" (อุปกรณ์ดับ) จึงเป็นหน้าที่ของ `deviceStale` (shadow_ts) ล้วนๆ
   *
   * ⚠️ ข้อจำกัดที่ต้องรู้: ถ้า backend ตีตรา `timestamp` ให้ทุก key เท่ากันทุกครั้งที่ส่ง
   * (ส่งเป็นก้อนเดียว) ตัวนี้จะจับอะไรไม่ได้เลย — ต้องดู payload จริงถึงจะรู้
   */
  const staleFields = useMemo<ReadonlySet<LiveField>>(() => {
    const stamps = new Map<LiveField, number>();
    for (const [field, key] of Object.entries(matched) as [LiveField, string][]) {
      const ts = telemetry.live[key]?.timestamp;
      // ไม่มี timestamp = ตัดสินไม่ได้ → ไม่กล่าวหา (เงียบดีกว่าเตือนผิด)
      if (typeof ts === 'number') stamps.set(field, ts);
    }
    const out = new Set<LiveField>();
    if (stamps.size < 2) return out; // มีค่าเดียว = ไม่มีอะไรให้เทียบ
    const newest = Math.max(...stamps.values());
    for (const [field, ts] of stamps) {
      if (newest - ts > SENSOR_STALE_MS) out.add(field);
    }
    return out;
  }, [matched, telemetry.live]);

  /**
   * เก็บค่าจริงย้อนหลังไว้ 8 จุดต่อค่า — เท่ากับจำนวนจุดของเส้นแนวโน้มในต้นแบบ
   *
   * ต่อจุดใหม่ตอน `lastUpdateAt` ขยับเท่านั้น ไม่ใช่ทุก render (ไม่งั้นเส้นจะยาวขึ้นเรื่อยๆ
   * จากค่าเดิมซ้ำๆ) และข้ามค่าที่ซ้ำกับจุดล่าสุดเพื่อไม่ให้เส้นแบนจากการรายงานค่าเดิม
   */
  const [trail, setTrail] = useState<Readonly<Partial<Record<LiveField, readonly number[]>>>>({});
  const lastStamp = useRef<number | null>(null);
  useEffect(() => {
    const stamp = telemetry.lastUpdateAt;
    if (stamp === null || stamp === lastStamp.current) return;
    lastStamp.current = stamp;

    const sample: Partial<Record<LiveField, number>> = { ...resolved.values };
    if (liveSoil !== null) sample.soil = liveSoil;
    const entries = Object.entries(sample) as readonly [LiveField, number][];
    if (entries.length === 0) return;

    setTrail((prev) => {
      const next: Partial<Record<LiveField, readonly number[]>> = { ...prev };
      let changed = false;
      for (const [key, value] of entries) {
        const cur = prev[key] ?? [];
        if (cur[cur.length - 1] === value) continue;
        next[key] = [...cur, value].slice(-TRAIL_POINTS);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [telemetry.lastUpdateAt, resolved, liveSoil]);

  /** บอกป้ายบน header ว่าได้ของจริงกี่ค่าจากที่ต้องใช้ทั้งหมด */
  useEffect(() => {
    // เซนเซอร์ที่ค่าค้างไม่นับเป็น "ค่าจริง" — ป้าย "ค่าจริง x/5" ต้องสะท้อนของที่ยังวัดอยู่จริง
    reportLiveCoverage(liveFields.size - staleFields.size, LIVE_FIELDS.length, staleFields.size);
  }, [liveFields, staleFields]);

  /**
   * ── ตรวจว่าอุปกรณ์ยัง "สด" ไหม จาก shadow_ts (เวลาที่อุปกรณ์เขียนค่าจริงล่าสุด) ──
   * socket ต่อติด ≠ อุปกรณ์ยังส่งค่า — backend re-send ค่าเก่าซ้ำได้ ทำให้ "อัปเดต 1 วิ" ทั้งที่อุปกรณ์เงียบ
   * รายงานเข้า liveStatus store ให้ ConnectionPill โชว์ "ค่าค้าง" + ให้ useDeviceCommand กันสั่งตอนออฟไลน์
   */
  const deviceLastSeenMs = useMemo(() => {
    if (!realControl) return null;
    const ts = readShadowTs(attributes);
    if (ts === null) return null;
    // กันหน่วยพลาด: ยืนยันจาก payload จริงว่าเป็น ms epoch (13 หลัก ~1.7e12) — แต่ถ้าวันหน้าอุปกรณ์
    // ส่งมาเป็น "วินาที" (< 1e12) จะทำให้ age มหาศาล → ทุกเครื่องกลายเป็น "ค้าง" ถาวร บล็อกคำสั่งหมด
    // คูณเป็น ms ให้ปลอดภัย (ค่า ms จริงตอนนี้ > 1e12 เสมอ ไม่โดนกฎนี้)
    return ts > 0 && ts < 1e12 ? ts * 1000 : ts;
  }, [realControl, attributes]);
  /**
   * สถานะจาก NETPIE (ทีม backend ส่งมาเพิ่ม 2026-08-07 · shared_scope · มาทาง telemetry stream)
   *   netpie_banned=true → อุปกรณ์ถูกระงับ ผู้ใช้แก้เองไม่ได้ → กันปุ่ม + ขึ้น "ติดต่อผู้ดูแล"
   *   netpie_status (0/1) → แสดงได้แต่ยังห้ามใช้ตัดสิน (ยังไม่เชื่อถือ 100% · ยึด shadow_ts เป็นหลัก)
   */
  const netpie = useMemo(() => {
    if (!realControl) return { banned: false, status: null as number | null };
    const raw = (k: string) => telemetry.live[k]?.value ?? attributes[k]?.value;
    return {
      banned: telemetryBoolean(raw('netpie_banned')) === true,
      status: telemetryNumber(raw('netpie_status')),
    };
  }, [realControl, telemetry.live, attributes]);
  const freshRef = useRef<{
    lastSeen: number | null;
    live: boolean;
    banned: boolean;
    status: number | null;
  }>({ lastSeen: null, live: false, banned: false, status: null });
  freshRef.current = {
    lastSeen: deviceLastSeenMs,
    live: realControl,
    banned: netpie.banned,
    status: netpie.status,
  };
  // รายงานทันทีเมื่อค่าเปลี่ยน (shadow_ts ขยับ / เข้า-ออกโหมดจริง / ban เปลี่ยน)
  useEffect(() => {
    const stale =
      realControl && deviceLastSeenMs !== null && Date.now() - deviceLastSeenMs > DEVICE_STALE_MS;
    reportDeviceFreshness(
      stale,
      realControl ? deviceLastSeenMs : null,
      realControl && netpie.banned,
      realControl ? netpie.status : null,
    );
  }, [deviceLastSeenMs, realControl, netpie.banned, netpie.status]);
  // และเดินนาฬิกาเองทุก 15 วิ — ให้ "พลิกเป็นค้าง" ได้แม้ค่าหยุดไหล (อุปกรณ์เงียบสนิท ไม่มี re-send)
  useEffect(() => {
    const id = window.setInterval(() => {
      const { lastSeen, live, banned, status } = freshRef.current;
      const stale = live && lastSeen !== null && Date.now() - lastSeen > DEVICE_STALE_MS;
      reportDeviceFreshness(stale, live ? lastSeen : null, live && banned, live ? status : null);
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);

  /**
   * ชื่อ key ที่ device ส่งมาแต่เรายังไม่รู้จัก — พิมพ์ให้เห็นครั้งเดียวต่อชุด
   * นี่คือวิธีเดียวที่จะรู้ชื่อจริงของ key ฝั่ง ThingsBoard โดยไม่ต้องเดา
   */
  const loggedUnmatched = useRef('');
  useEffect(() => {
    const sig = unmatched.join(',');
    if (sig === '' || sig === loggedUnmatched.current) return;
    loggedUnmatched.current = sig;
    console.warn(
      `[FarmState] device ส่ง key ที่ยังจับคู่ไม่ได้: ${sig} — ` +
        `ถ้าตัวไหนคือค่าที่หน้าจอต้องใช้ ให้เติมเข้า CLIMATE_KEY_RULES / SOIL_ALIASES`,
    );
  }, [unmatched]);

  const pump = devices.find((d) => d.id === 'pump');

  /**
   * auto-cutoff ปั๊ม (safety · แทน guard G1) — **เป็นเจ้าของที่ provider ระดับแอปโดยตั้งใจ**
   *
   * เดิมตัวจับเวลาอยู่ใน `useDeviceCommand` ต่อหน้า → พอออกจากหน้าควบคุม hook ถูก unmount
   * timer ถูกล้าง ปั๊มจึงเดินค้างเกิน 20 นาทีได้ (safety หลุด) · ที่นี่ provider ครอบทั้งแอป
   * ไม่ถูก unmount ตอนสลับหน้า จึงจับเวลาต่อเนื่องจริง
   *
   * ปั๊มเปิดจริง (on · ไม่มี pending) → ตั้งเวลาปิดเอง · ปั๊มปิด/estop → เคลียร์เวลา
   */
  const pumpCutoffRef = useRef<number | null>(null);
  const pumpSettleRef = useRef<number | null>(null);
  // อ่านโหมดตอน timer ยิง ไม่ใช่ตอนตั้ง — ผู้ใช้อาจล็อกอิน/หลุดระหว่าง 20 นาทีที่ปั๊มเดินอยู่
  const realControlRef = useRef(realControl);
  realControlRef.current = realControl;
  /**
   * ผู้ใช้กดปั๊มเอง — ตัวตามพัดลมต้องไม่ทับจนกว่าสถานะพัดลมจะเปลี่ยน
   * (เจ้าของงานสั่งให้ยังกดเองได้ เผื่อล้างแผงคูลลิ่ง/ซ่อม)
   */
  const [pumpManual, setPumpManual] = useState(false);
  const pumpManualRef = useRef(pumpManual);
  pumpManualRef.current = pumpManual;

  /**
   * 🔴 auto-cutoff นับ **เฉพาะตอนผู้ใช้กดปั๊มเอง**
   *
   * ตัวตัดนี้เกิดมาเพื่อกัน "เปิดค้างลืมปิด" ตอนที่ยังเข้าใจผิดว่าปั๊มคือระบบรดน้ำ
   * ปั๊มที่เดินตามพัดลมใหญ่ (คูลลิ่งแพด) **ห้ามถูกตัด** — พัดลมอาจต้องเดินยาวหลายชั่วโมง
   * กลางบ่ายที่ร้อนที่สุด ถ้าตัดปั๊มไปแผงจะแห้งแล้วหมดผลการลดอุณหภูมิทันที
   * และมันหยุดเองอยู่แล้วเมื่อพัดลมหยุด จึงไม่มีเคส "ลืมปิด"
   */
  const pumpRunning = !!pump && pump.on && pump.pending == null && pumpManual;

  /** เวลาที่จะตัด + ตัวนับครั้งที่ตัด — เปิดให้หน้าจอบอกผู้ใช้ล่วงหน้าและเด้ง toast ตอนตัด */
  const [pumpCutoffAt, setPumpCutoffAt] = useState<number | null>(null);
  const [pumpCutoffCount, setPumpCutoffCount] = useState(0);

  useEffect(() => {
    if (!pumpRunning) {
      if (pumpCutoffRef.current != null) {
        window.clearTimeout(pumpCutoffRef.current);
        pumpCutoffRef.current = null;
      }
      setPumpCutoffAt(null);
      return;
    }
    if (pumpCutoffRef.current != null) return;

    setPumpCutoffAt(Date.now() + PUMP_CUTOFF_MS);
    pumpCutoffRef.current = window.setTimeout(() => {
      pumpCutoffRef.current = null;
      setPumpCutoffAt(null);
      setPumpCutoffCount((n) => n + 1);
      const isReal = realControlRef.current;

      // โหมดจริง: ต้องสั่งปิด relay ปั๊ม (ch2) จริงด้วย — ปั๊มย้ายมาต่อ relay จริงแล้ว
      // ถ้าปิดแต่ local state เฉยๆ reconcile จะอ่าน led2=true กลับมาแล้วเปิดปั๊มใหม่วนไม่จบ
      // (safety cutoff 20 นาทีจะใช้ไม่ได้จริง) · ยิงแบบ estop (fire-and-forget) นอก setState
      if (isReal) {
        const ctx = readHsContext();
        const chPump = channelOf('pump');
        if (ctx && chPump !== null)
          void postHsCommand(
            ctx,
            { action: 'setSwitch', channel: chPump, on: false },
            newReqId(),
          ).catch(() => {});
      }

      // `pending: 'off'` ทำให้ `deviceRunning()` คืน false ทันที → การ์ดปั๊มดับทันทีไม่ต้องรอ led
      setDevices((prev) => prev.map((d) => (d.id === 'pump' ? { ...d, pending: 'off' } : d)));
      // เขียน log ตอนสั่ง ไม่ใช่ตอนยืนยัน — เหตุการณ์คือ "ระบบตัดการทำงาน" ซึ่งเกิดขึ้นแล้ว ณ จุดนี้
      setLog((prev) =>
        [
          { t: hhmm(new Date()), key: 'logPumpCutoff' as const, src: 'schedule' as const },
          ...prev,
        ].slice(0, LOG_LIMIT),
      );

      pumpSettleRef.current = window.setTimeout(
        () => {
          pumpSettleRef.current = null;
          setDevices((prev) => {
            const cur = prev.find((d) => d.id === 'pump');
            if (!cur || cur.pending == null) return prev; // reconcile จัดการไปแล้ว
            /*
             * โหมดจริง: **ห้ามตั้ง `on:false` เอง** — `led2` จริงตามมาช้า ~8 วิ
             * ถ้าตั้งเองตอนนี้ reconcile จะเห็น led=true vs on=false → ตีเป็น "led เปลี่ยน"
             * แล้วเด้งปั๊มกลับเป็น "เปิด" พร้อมทั้ง 8 แปลงกลับไปเป็น "กำลังรดน้ำ"
             * (ดูเหมือน safety cutoff ทำงานไม่สำเร็จ ทั้งที่สำเร็จ) ตัวนี้จึงแค่ปลด pending กันค้าง
             */
            return prev.map((d) =>
              d.id === 'pump'
                ? isReal
                  ? { ...d, pending: null }
                  : { ...d, pending: null, on: false }
                : d,
            );
          });
        },
        isReal ? LED_CONFIRM_TIMEOUT_MS : SEND_LATENCY_MS,
      );
    }, PUMP_CUTOFF_MS);
  }, [pumpRunning]);

  // เก็บกวาด timer ตอน provider unmount (แทบไม่เกิดในแอปจริง แต่กัน leak ในเทส)
  useEffect(
    () => () => {
      if (pumpCutoffRef.current != null) window.clearTimeout(pumpCutoffRef.current);
      if (pumpSettleRef.current != null) window.clearTimeout(pumpSettleRef.current);
    },
    [],
  );

  /** เดินค่าจำลอง — ย้ายมาจาก `useFarmSim` เดิมทั้งดุ้น พฤติกรรมเหมือนเดิมทุกอย่าง */
  useEffect(() => {
    const id = window.setInterval(() => {
      const jitter = (n: number) => (Math.random() - 0.5) * n;

      setClimate((c) => ({
        temp: clamp(
          c.temp + jitter(CLIMATE_DRIFT.temp.jitter),
          CLIMATE_DRIFT.temp.min,
          CLIMATE_DRIFT.temp.max,
        ),
        rh: clamp(
          c.rh + jitter(CLIMATE_DRIFT.rh.jitter),
          CLIMATE_DRIFT.rh.min,
          CLIMATE_DRIFT.rh.max,
        ),
        lux: clamp(
          c.lux + jitter(CLIMATE_DRIFT.lux.jitter),
          CLIMATE_DRIFT.lux.min,
          CLIMATE_DRIFT.lux.max,
        ),
      }));

      // ไม่มีระบบรดน้ำในโรงเรือนนี้ — ดินแห้งลงเรื่อยๆ ตามการระเหย (ปั๊มเป็นคูลลิ่งแพด ไม่รดแปลง)
      const delta = SOIL_DRIFT.idle;
      setBaseZones((prev) =>
        prev.map((z) => {
          const noise = (Math.random() - 0.5) * SOIL_DRIFT.noise;
          return { ...z, soil: clamp(z.soil + delta + noise, SOIL_DRIFT.min, SOIL_DRIFT.max) };
        }),
      );
    }, CLIMATE_TICK_MS);

    return () => window.clearInterval(id);
  }, []);

  /**
   * ── ควบคุมความชื้นด้วยพัดลมดูด (แอปสั่งเองตาม RH · ประหยัดไฟ) ──
   * เจ้าของอยู่ที่ provider (mount ครั้งเดียว) ไม่ใช่ต่อหน้า → ไม่ยิงซ้ำ · ตรรกะประหยัดไฟใน `nextVent`
   * อ่าน rh จาก `resolved.values.rh` (ค่าจริงล้วน ห้ามใช้ `climate.rh` ที่ปนจำลอง) · ยิง relay จริงแบบ estop
   */
  const humInputsRef = useRef<{
    rh: number | null;
    temp: number;
    live: boolean;
    estop: boolean;
    cfg: HumidityAuto;
  }>({ rh: null, temp: 0, live: false, estop: false, cfg: DEFAULT_HUMIDITY_AUTO });
  humInputsRef.current = {
    /*
     * 🔴 เซนเซอร์ที่ **ค่าค้าง** ต้องนับเป็น "ไม่มีค่า" ไม่ใช่ค่าจริง
     *
     * `liveFields` บอกแค่ว่า "ค่านี้มาจากเซนเซอร์จริง" — ไม่ได้บอกว่ายังอัปเดตอยู่ไหม
     * ถ้าเซนเซอร์ RH ตายคาที่ 90% (แบบเดียวกับที่เซนเซอร์ดินโดนถอดออกไป)
     * เครื่องยนต์จะสั่งพัดลมดูดอากาศเดินตลอดกาลจากตัวเลขที่ไม่มีใครวัดแล้ว
     * ไม่มีค่าจริง = ไม่สั่ง (ปลอดภัยกว่าสั่งจากค่าที่เชื่อไม่ได้)
     */
    rh: liveFields.has('rh') && !staleFields.has('rh') ? (resolved.values.rh ?? null) : null,
    // temp สำหรับ guard G2 เท่านั้น (ไม่ใช่เกณฑ์ RH) — ใช้ค่าเดียวกับที่ทั้งแอปใช้ตัดสิน G2
    temp: climate.temp,
    live: realControl,
    estop,
    cfg: humidityAuto,
  };
  const ventStateRef = useRef<VentState>(INITIAL_VENT_STATE);

  /**
   * พัดลมที่ **ผู้ใช้สั่งเอง** ระหว่างรอบดูดนี้ — ตัวคุมความชื้นต้องไม่ทับ
   *
   * เดิมตัวคุมความชื้นยิง `setSwitch` ให้ทั้งสองใบทุกครั้งที่ stage เปลี่ยน ผู้ใช้เปิดใบ #2 ไว้เอง
   * แล้วอยู่ดีๆ ระบบสั่งดับให้โดยไม่บอกว่าใครสั่ง (เจ้าของงานเลือก "ผู้ใช้ชนะชั่วคราว")
   * ล้างทั้งชุดเมื่อ stage กลับเป็น 0 = จบรอบดูด → รอบหน้าระบบคุมได้ตามปกติ
   */
  const [ventOverride, setVentOverride] = useState<readonly DeviceId[]>(NO_DEVICES);
  const ventOverrideRef = useRef(ventOverride);
  ventOverrideRef.current = ventOverride;
  const noteManualCommand = useCallback((id: DeviceId) => {
    if (id === 'pump') {
      setPumpManual(true);
      return;
    }
    if (id !== 'big1' && id !== 'big2') return;
    setVentOverride((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  /** ตัวประเมินรอบล่าสุด — ให้เรียกนอกจังหวะ interval ได้ (ตอนผู้ใช้ปิดสวิตช์ความชื้นเอง) */
  const tickRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const tick = () => {
      const { rh, temp, live, estop: es, cfg } = humInputsRef.current;
      // ออฟไลน์ (ไม่ live) = สั่ง relay ไม่ได้ · แช่ state ไว้ ไม่รีเซ็ต stage เป็น 0
      // ไม่งั้นพอกลับมา online เครื่องมือจะจำไม่ได้ว่าพัดลมที่ตัวเองเปิดไว้ยังหมุนอยู่ → ไม่สั่งปิด
      // (state จะถูกประเมินใหม่จาก stage เดิมทันทีที่ live กลับมา)
      if (!live) return;
      const now = Date.now();
      const { stage, state } = nextVent(ventStateRef.current, {
        // ค่าเกณฑ์ไม่ถูกต้อง (onAt<=offAt) = ปิดระบบ ไม่งั้นจะสั่งเปิด-ปิดรัวๆ (short-cycle กินไฟ)
        // UI โชว์ป้ายเตือนอยู่แล้ว แต่ต้องกันที่ engine ด้วย ไม่ให้ค่าเพี้ยนไปสั่ง relay จริง
        enabled: cfg.enabled && cfg.onAt > cfg.offAt,
        live,
        estop: es,
        rh,
        onAt: cfg.onAt,
        offAt: cfg.offAt,
        // ไม่จำกัดเวลา (useWindow=false) = ดูดตาม RH ทั้งวัน
        inWindow: !cfg.useWindow || inTimeWindow(new Date(now), cfg.windowStart, cfg.windowEnd),
        now,
      });
      const prevStage = ventStateRef.current.stage;
      ventStateRef.current = state;
      if (stage === prevStage) return;
      setHumidityVentStage(stage);

      // สั่ง relay จริง (นอก setState updater — กัน StrictMode ยิงซ้ำ) · เฉพาะโหมดจริง
      // big1=ch0 (+เล็กพ่วง) เปิดเมื่อ stage>=1 · big2=ch1 เปิดเมื่อ stage>=2
      {
        // guard G2: ห้ามปิดพัดลมใบใหญ่ทั้งคู่ขณะอุณหภูมิ > 33°C — คงใบ #1 ไว้ให้ระบายความร้อนต่อ
        // (เครื่องมือความชื้นสั่ง setSwitch ตรงจึงข้าม guard() ปกติ · ต้องเช็ค G2 เองตรงนี้)
        let onBig1 = stage >= 1;
        const onBig2 = stage >= 2;
        // keep-alive ใบ #1 **เฉพาะตอนฟีเจอร์ความชื้นยังเปิดอยู่** (RH ลดเอง แต่ยังร้อน = คงระบายความร้อน)
        // ถ้าผู้ใช้ "ปิดสวิตช์ความชื้นเอง" (cfg.enabled=false) → ต้องดับใบ #1 จริง ไม่บังคับเปิดกลับ
        // (ให้เหมือนปุ่มออโต้พัดลม disableTempAuto · UI เตือน+ยืนยันตอนจะดับตัวสุดท้ายขณะร้อนแล้ว)
        // ยกเว้นตอน estop — หยุดฉุกเฉินต้องปิดหมดทุกตัว G2 ไม่มีผล (useEstop ปิด ch0-2 อยู่แล้ว)
        const humActive = cfg.enabled && cfg.onAt > cfg.offAt;
        if (humActive && !onBig1 && !onBig2 && temp > BIG_FAN_LOCK_TEMP && !es) onBig1 = true;
        // พัดลมที่ผู้ใช้สั่งเองในรอบนี้ = ของผู้ใช้ ห้ามทับ (UI ติดป้ายบอกว่าใครคุมอยู่)
        const mine = ventOverrideRef.current;
        const ctx = readHsContext();
        if (ctx) {
          const ch0 = channelOf('big1');
          const ch1 = channelOf('big2');
          if (ch0 !== null && !mine.includes('big1'))
            void postHsCommand(
              ctx,
              { action: 'setSwitch', channel: ch0, on: onBig1 },
              newReqId(),
            ).catch(() => {});
          if (ch1 !== null && !mine.includes('big2'))
            void postHsCommand(
              ctx,
              { action: 'setSwitch', channel: ch1, on: onBig2 },
              newReqId(),
            ).catch(() => {});
        }
      }

      // จบรอบดูด → คืนสิทธิ์ให้ระบบคุมรอบหน้า (override เป็น "ชั่วคราว" จริงตามที่ตกลงไว้)
      if (stage === 0) setVentOverride(NO_DEVICES);

      // เขียน control log เฉพาะตอน "เริ่มดูด"/"หยุดดูด" (ข้ามการสลับ stage 1↔2 กันรก)
      if ((prevStage === 0) !== (stage === 0)) {
        const logKey = stage === 0 ? ('logHumOff' as const) : ('logHumOn' as const);
        setLog((prev) =>
          [{ t: hhmm(new Date()), key: logKey, src: 'schedule' as const }, ...prev].slice(
            0,
            LOG_LIMIT,
          ),
        );
      }
    };
    tickRef.current = tick;
    const id = window.setInterval(tick, HUM_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  /**
   * ปิดสวิตช์ความชื้นเอง → ต้องดับพัดลม **ทันที** ไม่ใช่รอ tick รอบถัดไป (นานสุด 20 วิ)
   * กล่องยืนยันบอกผู้ใช้ว่า "จะดับพัดลม" ผู้ใช้จึงต้องเห็นมันดับจริงตอนนั้น ไม่ใช่ยืนงงอยู่ 20 วินาที
   */
  useEffect(() => {
    if (!humidityAuto.enabled) tickRef.current();
  }, [humidityAuto.enabled]);

  /**
   * ── ปั๊มคูลลิ่งแพดตามพัดลมใหญ่ ──
   *
   * ปั๊มตัวนี้ **ไม่ได้มีไว้รดน้ำ** — มันป้อนน้ำเข้าแผงคูลลิ่งแพด พัดลมใหญ่ดูดอากาศผ่านแผงเปียก
   * แล้วอุณหภูมิในโรงเรือนลดลง (evaporative cooling) เจ้าของงานยืนยัน 2026-08-11
   *
   * แผงต้องเปียกทุกครั้งที่มีลมผ่าน → **พัดลมใหญ่ตัวใดตัวหนึ่งเดินก็พอ**
   * และห้ามปล่อยให้ปั๊มเดินตอนไม่มีลม เพราะนั่นคือเปลืองน้ำเปล่าล้วนๆ
   *
   * ทำที่ provider ระดับแอป (ไม่ใช่ต่อหน้า) เพราะสลับหน้าแล้วต้องยังตามกันอยู่
   * และยิงเฉพาะตอน "ต้องการเปลี่ยนค่า" ไม่ยิงซ้ำทุก render
   */
  /**
   * 🔴 โหมดจริงอ่านจาก `led` ไม่ใช่ `devices` — สำคัญ
   *
   * `devices` เริ่มจากค่าจำลอง (`INITIAL_DEVICES` ตั้ง big1 เปิดไว้) แล้วค่อยถูก reconcile
   * ให้ตรงกับ `led` ใน effect รอบถัดไป ถ้าตัวตามอ่าน `devices` มันจะเห็น "พัดลมเดิน" ชั่วขณะ
   * ตอนเปิดหน้า แล้วยิงคำสั่งเปิดปั๊มใส่อุปกรณ์จริงทันที ตามด้วยสั่งปิดอีกรอบเมื่อ reconcile เสร็จ
   */
  const bigFanOn =
    realControl && channelStates
      ? channelStates[0]?.on === true || channelStates[1]?.on === true
      : devices.some((d) => (d.id === 'big1' || d.id === 'big2') && deviceRunning(d));
  /**
   * พร้อมตัดสินหรือยัง — โหมดจริงต้องรอ `led` ของพัดลมมาถึงก่อน
   * ไม่งั้นตอนเปิดหน้าจะตัดสินจากค่าเริ่มต้นจำลอง แล้วยิงคำสั่งผิดใส่อุปกรณ์จริงทันที
   */
  const followReady =
    !realControl ||
    (channelStates?.[0]?.on !== null &&
      channelStates?.[0]?.on !== undefined &&
      channelStates[1]?.on !== null &&
      channelStates[1]?.on !== undefined);
  /** สถานะปั๊มจริง — อ่านแหล่งเดียวกับ `bigFanOn` เพื่อไม่ให้เทียบข้ามแหล่ง */
  const pumpOn =
    realControl && channelStates ? channelStates[2]?.on === true : !!pump && deviceRunning(pump);

  /** เป้าหมายที่ "สั่งไปแล้วและกำลังรอ `led` ยืนยัน" · `null` = ไม่มีคำสั่งค้าง */
  const wantPumpRef = useRef<boolean | null>(null);
  /** สถานะพัดลมรอบก่อน — ใช้ตัดสินว่า "เป้าหมายเปลี่ยน" (จบรอบที่ผู้ใช้แย่งคุม) */
  const lastFanRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (estop) {
      // หยุดฉุกเฉินปิด ch0-2 ให้อยู่แล้ว · ล้างความจำไว้ให้ตัวตามประเมินใหม่ตอนปลดล็อก
      wantPumpRef.current = null;
      lastFanRef.current = null;
      setPumpManual(false);
      return;
    }
    if (!followReady) return;

    /*
     * 🔴 ต้องล้างความจำเมื่อ "เป้าหมายเปลี่ยน" ไม่ใช่จำข้ามยาว
     *
     * เคยพลาดมาแล้ว (เจ้าของงานจับได้จากหน้าจอจริง): ตอนเปิดหน้ายังไม่ล็อกอิน = โหมดจำลอง
     * พัดลม #1 เปิด + ปั๊มเปิด (ค่าเริ่มต้น) → สถานะตรงกัน จึงจำว่า "เป้าหมาย = เปิด" แล้วไม่ทำอะไร
     * พอ socket ต่อติดกลายเป็นโหมดจริง อุปกรณ์รายงาน `led2=false` (ปั๊มปิดจริง)
     * แต่ `bigFanOn` ยังเป็น true เท่าเดิม → เงื่อนไข "สั่งไปแล้ว" ตัดจบทันที
     * **ปั๊มเลยไม่มีวันถูกสั่งเปิดเลย** ทั้งที่พัดลมเดินอยู่
     */
    let manual = pumpManualRef.current;
    if (lastFanRef.current !== bigFanOn) {
      lastFanRef.current = bigFanOn;
      wantPumpRef.current = null;
      // เป้าหมายเปลี่ยน = จบรอบที่ผู้ใช้แย่งคุม คืนสิทธิ์ให้ตัวตาม
      // (ถ้าไม่คืน ปั๊มที่ผู้ใช้เปิดไว้ล้างแผงจะค้างเดินต่อหลังพัดลมดับ = เปลืองน้ำโดยไม่มีใครดู)
      if (manual) {
        setPumpManual(false);
        manual = false; // ใช้ค่าท้องถิ่นต่อในรอบนี้ — `pumpManualRef` เพิ่งอัปเดตตอน render ถัดไป
      }
    }
    // ผู้ใช้กำลังคุมเอง (เปิดล้างแผง/ซ่อม) — ห้ามทับจนกว่าสถานะพัดลมจะเปลี่ยน
    if (manual) return;

    // ตรงกันอยู่แล้ว → ไม่ต้องสั่งและไม่ต้องเขียน log · ล้างคำสั่งค้างเพราะอุปกรณ์ยืนยันแล้ว
    if (pumpOn === bigFanOn) {
      wantPumpRef.current = null;
      return;
    }
    // สั่งไปแล้วรอบนี้ — อย่ายิงซ้ำระหว่างรอ `led2` ยืนยัน (มาช้า ~8 วิ)
    if (wantPumpRef.current === bigFanOn) return;
    wantPumpRef.current = bigFanOn;

    if (realControlRef.current) {
      const ctx = readHsContext();
      const ch = channelOf('pump');
      if (ctx && ch !== null)
        void postHsCommand(
          ctx,
          { action: 'setSwitch', channel: ch, on: bigFanOn },
          newReqId(),
        ).catch(() => {});
      // ไม่ตั้ง `pending` — สถานะจริงมาจาก `led2` ผ่าน reconcile (แพตเทิร์นเดียวกับตัวคุมความชื้น)
    } else {
      setDevices((prev2) =>
        prev2.map((d) => (d.id === 'pump' ? { ...d, on: bigFanOn, pending: null } : d)),
      );
    }

    setLog((prevLog) =>
      [
        {
          t: hhmm(new Date()),
          key: bigFanOn ? ('logPadPumpOn' as const) : ('logPadPumpOff' as const),
          src: 'schedule' as const,
        },
        ...prevLog,
      ].slice(0, LOG_LIMIT),
    );
    // `pumpOn` ต้องอยู่ใน deps — ไม่งั้นตอนสถานะปั๊มจริงเปลี่ยน (led2 มาถึง / มีคนสับที่ตู้)
    // ตัวตามจะไม่ได้ประเมินใหม่ แล้วปั๊มค้างไม่ตรงกับพัดลมอยู่อย่างนั้น
    //
    // `pumpManual` ก็ต้องอยู่ด้วย — ผู้ใช้กด "อัตโนมัติ" คือการเปลี่ยนเป้าหมาย ต้องประเมินใหม่ทันที
    // ไม่ใช่รอจนสถานะพัดลมบังเอิญเปลี่ยน (อ่านค่าจริงผ่าน `pumpManualRef` ข้างในเหมือนเดิม)
  }, [bigFanOn, pumpOn, estop, followReady, pumpManual]);

  /**
   * สลับโหมดปั๊มด้วยมือ — ปุ่ม "อัตโนมัติ" บนการ์ดปั๊มเรียกตัวนี้
   *
   * ต้องล้าง `wantPumpRef` ตอนกลับเป็นอัตโนมัติ ไม่งั้นคำสั่งค้างรอบก่อนจะไปตรงกับเป้าหมายใหม่พอดี
   * แล้วตัวตามตัดจบที่ "สั่งไปแล้ว" ทั้งที่ยังไม่เคยสั่งจริงในรอบนี้ → ปั๊มไม่ขยับตาม
   */
  const setPumpMode = useCallback((mode: 'auto' | 'manual') => {
    if (mode === 'manual') {
      setPumpManual(true);
      return;
    }
    wantPumpRef.current = null;
    setPumpManual(false);
  }, []);

  /**
   * พัดลมที่ตัวคุมความชื้นกำลังคุมอยู่จริง — ใช้ติดป้ายบนการ์ดว่า "ใครสั่งอยู่"
   * ตัวที่ผู้ใช้แย่งไปแล้วจะหลุดจากรายการนี้ (UI ขึ้น "คุมด้วยมือ" แทน)
   */
  const ventOwned = useMemo<readonly DeviceId[]>(() => {
    const out: DeviceId[] = [];
    if (humidityVentStage >= 1 && !ventOverride.includes('big1')) out.push('big1');
    if (humidityVentStage >= 2 && !ventOverride.includes('big2')) out.push('big2');
    return out.length > 0 ? out : NO_DEVICES;
  }, [humidityVentStage, ventOverride]);

  /**
   * ถ้าปั๊มเดิน ทุกแปลงกำลังโดนน้ำ — สถานะดินเดิมกลับมาเองตอนปิดปั๊ม
   *
   * ความชื้นดินจริงถ้ามี ใช้ค่าเดียวกันทุกแปลง เพราะยังไม่ยืนยันว่ามีเซนเซอร์แยกแปลง
   * (มีตัวเดียวแล้วแจกเลขปลอมให้อีก 7 แปลงจะดูเหมือนวัดมาจริงทั้งหมด ซึ่งหลอกคนใช้)
   */
  const zones = useMemo<readonly SceneZone[]>(() => {
    /*
     * มีเซนเซอร์ดินจริง = ทุกแปลงใช้ค่าเดียวกัน **และสถานะต้องมาจากค่านั้นด้วย**
     * ไม่งั้นหมุดจะโชว์ "99%" แต่ยังกะพริบวิกฤตตามสถานะที่ฝังไว้ (strawberry) — ขัดกันเอง
     */
    const withSoil =
      liveSoil === null
        ? baseZones
        : baseZones.map((z) => ({ ...z, soil: liveSoil, status: soilToZoneStatus(liveSoil) }));
    return withSoil;
  }, [baseZones, liveSoil]);

  /** โหมดกับ `Device.auto` ต้องไปด้วยกันเสมอ ไม่งั้นสองหน้าจะบอกคนละอย่าง */
  const setMode = useCallback((id: DeviceId, mode: GhMode) => {
    setModes((prev) => ({ ...prev, [id]: mode }));
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, auto: mode !== 'manual' } : d)));
  }, []);

  const setThreshold = useCallback((key: SensorKey, next: Threshold) => {
    setThresholds((prev) => ({ ...prev, [key]: next }));
  }, []);

  const live = useMemo<LiveInfo>(
    () => ({
      status: telemetry.connectionStatus,
      fields: liveFields,
      stale: staleFields,
      matched,
      updatedAt: telemetry.lastUpdateAt,
      error: telemetry.errorMessage,
      unmatched,
      trail,
      command,
      alarms: telemetry.alarms,
    }),
    [
      telemetry.connectionStatus,
      telemetry.lastUpdateAt,
      telemetry.errorMessage,
      liveFields,
      staleFields,
      matched,
      unmatched,
      trail,
      command,
      telemetry.alarms,
    ],
  );

  const value = useMemo<FarmState>(
    () => ({
      climate,
      zones,
      devices,
      setDevices,
      modes,
      setMode,
      estop,
      setEstop,
      estopDefied,
      pumpCutoffAt,
      pumpCutoffCount,
      tank: INITIAL_TANK_PCT,
      log,
      setLog,
      thresholds,
      setThreshold,
      notifPrefs,
      toggleNotif,
      deviceThresholds,
      setDeviceThreshold,
      deviceSchedules,
      setDeviceSchedule,
      wateringConfig,
      updateWatering,
      zoneSettings,
      setZoneSettings,
      humidityAuto,
      setHumidityAuto,
      humidityVentStage,
      ventOwned,
      pumpManual,
      setPumpMode,
      noteManualCommand,
      activityLogs,
      addActivityLog,
      live,
      realControl,
      channelStates,
    }),
    [
      climate,
      zones,
      devices,
      modes,
      setMode,
      estop,
      estopDefied,
      pumpCutoffAt,
      pumpCutoffCount,
      log,
      thresholds,
      setThreshold,
      notifPrefs,
      toggleNotif,
      deviceThresholds,
      setDeviceThreshold,
      deviceSchedules,
      setDeviceSchedule,
      wateringConfig,
      updateWatering,
      zoneSettings,
      setZoneSettings,
      humidityAuto,
      setHumidityAuto,
      humidityVentStage,
      ventOwned,
      pumpManual,
      setPumpMode,
      noteManualCommand,
      activityLogs,
      addActivityLog,
      live,
      realControl,
      channelStates,
    ],
  );

  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}

/**
 * ต้องอยู่ใต้ `FarmStateProvider` เสมอ — โยน error ทันทีถ้าลืมครอบ
 * ดีกว่าปล่อยให้หน้าเงียบๆ แล้วแสดงค่าคนละชุดกับหน้าอื่นเหมือนบั๊กเดิม
 */
export function useFarmState(): FarmState {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error('useFarmState ต้องเรียกใต้ <FarmStateProvider>');
  return ctx;
}
