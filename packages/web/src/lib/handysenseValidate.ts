/**
 * ตรวจคำสั่ง HandySense ก่อนส่ง (เอกสารข้อ 9)
 *
 * ระบบ backend validate ซ้ำอยู่แล้วและเป็นด่านตัดสิน — แต่ FE กันไว้ก่อนเพื่อ UX
 * (ผู้ใช้ไม่ควรต้องรอ 1-2 วินาทีเพื่อรู้ว่าพิมพ์เลขผิด)
 *
 * คืน `null` = ผ่าน · คืน `HsErrorCode` = ไม่ผ่าน (หน้าจอค่อย map เป็นข้อความไทย)
 * แยกเป็น "code" ไม่ใช่ข้อความ เพื่อทดสอบได้แน่นอนและ localize ได้
 */
import {
  HS_MAX_SLOT,
  HS_SOIL_RANGE,
  HS_TEMP_RANGE,
  HS_TEST_CHANNEL,
  HS_DAY_KEYS,
  type HsCommand,
  type HsSetSchedule,
  type HsSetThreshold,
  type HsThresholdBand,
} from '@shared/handysense';

export type HsErrorCode =
  | 'channel' // channel นอกช่วง 0-3
  | 'testChannelSwitch' // setSwitch กับ channel 3 (test)
  | 'onType' // on ไม่ใช่ boolean แท้
  | 'mode' // mode ไม่ใช่ auto/no-auto
  | 'autoNeedsBoth' // mode auto แต่ขาด temp หรือ soil
  | 'noAutoExtra' // mode no-auto แต่ยังส่ง temp/soil มา
  | 'enabledType' // band.enabled ไม่ใช่ boolean
  | 'enabledNeedsRange' // enabled=true แต่ขาด min/max
  | 'minMax' // min ≥ max
  | 'tempRange' // temp นอก 0-60
  | 'soilRange' // soil นอก 0-100
  | 'slot' // slot นอก 0-2
  | 'enableType' // enable ไม่ใช่ boolean
  | 'pauseHasDays' // โหมด pause (ไม่มี days) แต่ดันแนบ startTime/endTime มา
  | 'days' // days ต้องครบ 7 key และมีอย่างน้อย 1 วันเป็น true
  | 'timeFormat' // ไม่ใช่ "HH:mm:ss"
  | 'timeEqual' // start == end
  | 'timeOrder'; // start > end (ยังไม่รองรับข้ามเที่ยงคืน)

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/** channel ต้องเป็นจำนวนเต็ม 0-3 */
function badChannel(channel: number): boolean {
  return !isInt(channel) || channel < 0 || channel > 3;
}

/** "HH:mm:ss" 24 ชม. → วินาทีตั้งแต่เที่ยงคืน · คืน null ถ้ารูปแบบผิด */
function parseHms(t: string): number | null {
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3]);
  if (h > 23 || min > 59 || s > 59) return null;
  return h * 3600 + min * 60 + s;
}

function validateBand(band: HsThresholdBand): HsErrorCode | null {
  if (!isBool(band.enabled)) return 'enabledType';
  if (!band.enabled) return null; // ปิดอยู่ = ไม่ต้องเช็ก min/max
  if (typeof band.min !== 'number' || typeof band.max !== 'number') return 'enabledNeedsRange';
  if (!(band.min < band.max)) return 'minMax';
  return null;
}

function validateThreshold(cmd: HsSetThreshold): HsErrorCode | null {
  if (cmd.mode !== 'auto' && cmd.mode !== 'no-auto') return 'mode';

  if (cmd.mode === 'no-auto') {
    // ปิด automation = ห้ามส่ง temp/soil เลย (เอกสารข้อ 6.2)
    if (cmd.temp !== undefined || cmd.soil !== undefined) return 'noAutoExtra';
    return null;
  }

  // mode auto → ต้องมีทั้ง temp และ soil ครบ (แม้แก้แค่ตัวเดียว)
  if (cmd.temp === undefined || cmd.soil === undefined) return 'autoNeedsBoth';

  const tErr = validateBand(cmd.temp);
  if (tErr) return tErr;
  if (cmd.temp.enabled) {
    const { min, max } = cmd.temp;
    if (min! < HS_TEMP_RANGE.min || max! > HS_TEMP_RANGE.max) return 'tempRange';
  }

  const sErr = validateBand(cmd.soil);
  if (sErr) return sErr;
  if (cmd.soil.enabled) {
    const { min, max } = cmd.soil;
    if (min! < HS_SOIL_RANGE.min || max! > HS_SOIL_RANGE.max) return 'soilRange';
  }
  return null;
}

function validateSchedule(cmd: HsSetSchedule): HsErrorCode | null {
  if (!isInt(cmd.slot) || cmd.slot < 0 || cmd.slot > HS_MAX_SLOT) return 'slot';
  if (!isBool(cmd.enable)) return 'enableType';

  const hasDays = cmd.days !== undefined;
  const hasTimes = cmd.startTime !== undefined || cmd.endTime !== undefined;

  // โหมด B (pause/resume): ไม่มี days → ต้องไม่มี startTime/endTime ด้วย
  if (!hasDays) {
    if (hasTimes) return 'pauseHasDays';
    return null;
  }

  // โหมด A (แก้วัน/เวลา): days ครบ 7 key + อย่างน้อย 1 วันเป็น true
  const days = cmd.days!;
  for (const k of HS_DAY_KEYS) {
    if (!isBool(days[k])) return 'days';
  }
  if (!HS_DAY_KEYS.some((k) => days[k])) {
    // ลบตารางโดยตั้งใจ (guide §6.3): enable=false + ไม่ติ๊กวันเลย + ไม่มีเวลา = อุปกรณ์ลบ slot ทิ้ง
    // โหมด pause ไม่เคยแนบ days · โหมด A บังคับ ≥1 วัน → all-false เกิดได้จาก "คำสั่งลบ" เท่านั้น
    if (cmd.enable === false && !hasTimes) return null;
    return 'days'; // เปิดใช้แต่ไม่เลือกวันเลย = ผู้ใช้พลาด
  }

  if (typeof cmd.startTime !== 'string' || typeof cmd.endTime !== 'string') return 'timeFormat';
  const start = parseHms(cmd.startTime);
  const end = parseHms(cmd.endTime);
  if (start === null || end === null) return 'timeFormat';
  if (start === end) return 'timeEqual';
  if (start > end) return 'timeOrder'; // ยังไม่รองรับช่วงข้ามเที่ยงคืน
  return null;
}

/** ตรวจคำสั่งเดียว · reqId ไม่ถูกตรวจที่นี่ — เป็นหน้าที่ของ client ที่สร้างใหม่ทุกครั้ง */
export function validateHsCommand(cmd: HsCommand): HsErrorCode | null {
  if (badChannel(cmd.channel)) return 'channel';

  switch (cmd.action) {
    case 'setSwitch':
      if (cmd.channel === HS_TEST_CHANNEL) return 'testChannelSwitch';
      if (!isBool(cmd.on)) return 'onType';
      return null;
    case 'setThreshold':
      return validateThreshold(cmd);
    case 'setSchedule':
      return validateSchedule(cmd);
  }
}
