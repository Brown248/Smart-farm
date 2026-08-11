import { useEffect, useRef, useState } from 'react';
import type { LiveField } from '@/config/telemetryKeys';
import { useFarmState } from '@/state/FarmStateProvider';

export interface LiveSensors {
  readonly temp: number;
  readonly hum: number;
  readonly light: number;
  /** ความชื้นดิน — `null` = ยังไม่มีเซนเซอร์จริง (การ์ดจะใช้ค่าค้างของต้นแบบต่อ) */
  readonly soil: number | null;
  /** ค่าไหนมาจากเซนเซอร์จริง — เอาไปติดป้ายบนการ์ด ไม่ให้เลขจำลองปนกับของจริงเงียบๆ */
  readonly liveFields: ReadonlySet<LiveField>;
  /** ส่วนย่อยของ `liveFields` ที่เซนเซอร์หยุดส่งแล้ว — ค่ายังโชว์ แต่ห้ามเรียกว่า "ค่าจริง" */
  readonly staleFields: ReadonlySet<LiveField>;
  /** ค่าจริงย้อนหลังไม่เกิน 8 จุด — เส้นแนวโน้มในการ์ดที่ติดป้าย "ค่าจริง" ต้องเป็นของจริงด้วย */
  readonly trail: Readonly<Partial<Record<LiveField, readonly number[]>>>;
  /** เวลาที่ได้ค่าจริงล่าสุด (ms epoch) — `null` เมื่อยังไม่มีของจริง · ใช้กับป้าย "อัปเดต … ที่แล้ว" */
  readonly updatedAt: number | null;
}

/**
 * ค่าเซนเซอร์ที่การ์ดบนแดชบอร์ดแสดง
 *
 * เดิม hook นี้เดินค่าจำลองของตัวเอง (31°C / 62%) คนละชุดกับฉากเกม (33.4°C / 78%)
 * ทำให้โรงเรือนหลังเดียวรายงานอุณหภูมิคนละค่าตามหน้าที่เปิดอยู่
 * ตอนนี้อ่านจาก `FarmStateProvider` ที่เดียว
 */
export function useLiveSensors(): LiveSensors {
  const { climate, zones, live } = useFarmState();
  return {
    temp: climate.temp,
    hum: climate.rh,
    light: climate.lux,
    // ทุกแปลงใช้ค่าเดียวกันเมื่อเป็นค่าจริง จึงอ่านจากแปลงแรกได้
    soil: live.fields.has('soil') ? (zones[0]?.soil ?? null) : null,
    liveFields: live.fields,
    staleFields: live.stale,
    trail: live.trail,
    updatedAt: live.updatedAt,
  };
}

/**
 * วินาทีที่ผ่านไปนับจาก "อ่านค่าจริงครั้งล่าสุด" — ใช้กับป้าย "อัปเดต … ที่แล้ว"
 *
 * ส่ง `live.updatedAt` (epoch ของ telemetry ล่าสุด) เข้ามา ป้ายจะรีเซ็ตทุกครั้งที่มีค่าจริงใหม่
 * จึงสะท้อนความสดจริง — ถ้าเซนเซอร์หยุดยิง ตัวเลขจะไต่ขึ้นเรื่อยๆ บอกว่าข้อมูลเริ่มค้าง
 * (เดิมผูกกับปุ่ม "ลองอ่านใหม่" จึงไต่จากตอนเปิดหน้าไปเรื่อยๆ ไม่เกี่ยวกับข้อมูลจริงเลย)
 */
export function useElapsedSeconds(lastUpdateAt: number | null): number {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    // มี timestamp จริง → เริ่มนับจากตอนนั้น (อาจไม่ใช่ 0 ถ้าค่ามาก่อนหน้า)
    const base = lastUpdateAt ?? Date.now();
    const compute = () => setSecs(Math.max(0, Math.round((Date.now() - base) / 1000)));
    compute();
    const id = window.setInterval(compute, 1000);
    return () => window.clearInterval(id);
  }, [lastUpdateAt]);

  return secs;
}

/**
 * ความคืบหน้า 0→1 ของ animation ตัวเลขนับขึ้นตอนเข้าหน้า
 * ข้ามทันทีถ้าผู้ใช้ขอลดการเคลื่อนไหว หรือแท็บถูกซ่อนอยู่
 */
export function useIntroProgress(reduced: boolean, durationMs = 900): number {
  const [progress, setProgress] = useState(reduced ? 1 : 0);
  const raf = useRef(0);

  useEffect(() => {
    if (reduced || (typeof document !== 'undefined' && document.hidden)) {
      setProgress(1);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [reduced, durationMs]);

  return progress;
}

/** จำลองการอ่านค่าใหม่ — ใช้กับปุ่ม "ลองอ่านใหม่" ของเซนเซอร์ที่ค่าค้าง */
export function useRetryableLoad(initialDelayMs = 700, retryDelayMs = 1100) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    timer.current = window.setTimeout(() => setLoading(false), initialDelayMs);
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [initialDelayMs]);

  const retry = () => {
    setLoading(true);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setLoading(false);
      setToken((v) => v + 1);
    }, retryDelayMs);
  };

  return { loading, retry, token };
}
