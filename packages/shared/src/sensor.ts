/** ชื่อ attribute ที่ NETPIE ใช้จริง (ยืนยันจากการสำรวจ API) */
export const NETPIE_ATTRS = ['temperature', 'humidity', 'soil', 'lux'] as const;
export type NetpieAttr = (typeof NETPIE_ATTRS)[number];

/** Telemetry key ที่ใช้ใน ThingsBoard และในเว็บ */
export const TELEMETRY_KEYS = ['temperature', 'humidity', 'soil_moisture', 'light'] as const;
export type TelemetryKey = (typeof TELEMETRY_KEYS)[number];

/** แมป NETPIE → ThingsBoard (ใช้ใน bridge/mapper.ts) */
export const ATTR_TO_TELEMETRY: Readonly<Record<NetpieAttr, TelemetryKey>> = {
  temperature: 'temperature',
  humidity: 'humidity',
  soil: 'soil_moisture',
  lux: 'light',
};

export type Unit = '°C' | '%' | 'k lux' | 'ppm';

/** จุดข้อมูล 1 จุด (timestamp เป็น ms ตามที่ NETPIE ส่งมา) */
export interface SensorPoint {
  readonly ts: number;
  readonly value: number;
}

export interface SensorSeries {
  readonly key: TelemetryKey;
  readonly unit: Unit;
  readonly points: readonly SensorPoint[];
}

/** ค่าสภาพอากาศรวมของโรงเรือน (ที่แสดงบน HUD) */
export interface ClimateSnapshot {
  readonly temp: number; // °C
  readonly rh: number; // %
  readonly lux: number; // k lux
  readonly updatedAt: number;
}

/** คีย์ 4 ค่าที่ HUD แสดง — ตรงกับลำดับการ์ดในต้นแบบ */
/**
 * ค่าอากาศที่ HUD แสดง — **ไม่มี CO₂**
 *
 * ต้นแบบมีการ์ด CO₂ แต่ฟาร์มจริงไม่มีเซนเซอร์ CO₂ (HandySense ส่งมาแค่
 * `temperature` · `humidity` · `light` · `soil_moisture`) เจ้าของงานสั่งตัดออก
 * — เหตุผลเดียวกับที่ตัดวาล์วรายโซนทิ้ง: ไม่โชว์อุปกรณ์ที่ไม่มีจริง
 *
 * คีย์แปล `hudCo2` · `cCo2` · `cCo2Note` **ยังอยู่** เพราะ `hudCo2` เป็น 1 ใน 168
 * คีย์ฉากเกมที่กฎเหล็กข้อ 7 ห้ามลบ (และ TH/EN ต้องเท่ากัน)
 */
export const CLIMATE_KEYS = ['temp', 'rh', 'lux'] as const;
export type ClimateKey = (typeof CLIMATE_KEYS)[number];

/** ค่าอากาศแบบไม่มี timestamp — ใช้ภายในหน้าเว็บระหว่าง animate ตัวเลข */
export type ClimateValues = Readonly<Record<ClimateKey, number>>;
