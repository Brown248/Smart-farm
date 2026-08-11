import { useEffect, useState } from 'react';
import type { ConnectionStatus } from '@/hooks/useTelemetry';

/**
 * สถานะการไหลของข้อมูลระดับแอป — ให้ป้ายบน header รู้ว่าตอนนี้ข้อมูลสดหรือจำลอง
 *
 * ทำเป็น store เล็กๆ ระดับโมดูล ไม่ใช่ context เพราะ:
 *   - ป้ายสถานะอยู่ใน `DataPage`/`DashboardHeader` ซึ่งอยู่**เหนือ**ตัวที่ subscribe
 *     ถ้าใช้ context จะต้องยก provider ขึ้นไปอีกชั้นเพื่อให้ป้ายอ่านได้
 *   - ป้ายไม่ควรเปิด socket ของตัวเอง มันแค่ "ฟัง" ว่าใครที่ subscribe อยู่รายงานอะไรมา
 *
 * ค่าเริ่มต้นเป็น `'mock'` — ตราบใดที่ยังไม่มีใคร subscribe สำเร็จ ก็คือยังใช้ข้อมูลจำลองอยู่
 * (จริงตอนนี้ และจะยังจริงจนกว่า `FarmStateProvider` จะต่อ telemetry ของจริง)
 */
export interface LiveSnapshot {
  readonly status: ConnectionStatus;
  /**
   * จำนวนค่าบนหน้าจอที่มาจากเซนเซอร์จริง / จำนวนค่าที่หน้าจอต้องใช้ทั้งหมด
   *
   * ต่อติดแล้วไม่ได้แปลว่าได้ค่าครบ — device อาจยิงมาแค่ 2 จาก 5 ค่า
   * ป้ายที่บอกแค่ "ข้อมูลสด" จะทำให้เข้าใจว่าทุกเลขบนจอเป็นของจริง ซึ่งไม่จริง
   */
  readonly liveCount: number;
  readonly totalCount: number;
  /**
   * ค่าที่มาจากเซนเซอร์จริงแต่ **หยุดอัปเดตแล้ว** (ดู SENSOR_STALE_MS) — ไม่ถูกนับใน liveCount
   *
   * ต้องแยกออกมา ไม่งั้นเซนเซอร์ค้างหมดทุกตัวจะได้ liveCount 0 แล้วป้ายไปขึ้นว่า
   * "ต่อติดแล้ว รอค่า…" ซึ่งผิด — ค่ามีอยู่ครบ แค่เป็นของเก่า คนละสถานการณ์กันคนละเรื่อง
   */
  readonly staleCount: number;
  /**
   * เหตุผลที่ต่อไม่ติด ตามที่ server บอกมา — `null` เมื่อไม่มีปัญหา
   *
   * ต้องเห็นบนหน้าจอ ไม่ใช่อยู่แต่ใน console: "Invalid authentication token" บอกให้ล็อกอินใหม่
   * ขณะที่ป้าย "ขาดการเชื่อมต่อ" เฉยๆ ทำให้เข้าใจว่าเน็ตมีปัญหาแล้วนั่งรอเก้อ
   */
  readonly errorMessage: string | null;
  /**
   * อุปกรณ์เงียบเกินเกณฑ์ (shadow_ts เก่า) → ค่าที่เห็นบนจอเป็น "ค่าค้าง" ไม่ใช่ของสด
   * socket ต่อติด (`status: 'live'`) ไม่ได้แปลว่าตัวอุปกรณ์ยังส่งค่าจริง — backend อาจ re-send ค่าเก่าซ้ำ
   * ถ้าไม่แยกจะโชว์ "ข้อมูลสด · อัปเดต 1 วิ" ทั้งที่อุปกรณ์เงียบไปนานแล้ว (อันตรายกับระบบควบคุม)
   */
  readonly deviceStale: boolean;
  /** shadow_ts — เวลาที่อุปกรณ์เขียนค่าจริงล่าสุด (ms epoch) · `null` = ไม่รู้ (mock / ยังไม่มีค่า) */
  readonly deviceLastSeenMs: number | null;
  /**
   * `netpie_banned=true` → อุปกรณ์ถูก NETPIE ระงับ · ผู้ใช้แก้เองไม่ได้ (ต้องติดต่อผู้ดูแล)
   * สำคัญ: อุปกรณ์ที่ถูกแบน/ดับ ถ้ากดสั่ง ระบบจะตอบ `ok:true` (คำสั่งค้างที่ NETPIE อุปกรณ์ไม่ได้รับ)
   * → ต้องกันปุ่ม ไม่งั้นผู้ใช้เข้าใจผิดว่าสำเร็จ (ยืนยันกับทีม backend 2026-08-07)
   */
  readonly deviceBanned: boolean;
  /**
   * `netpie_status` (0/1) — **แสดงได้ แต่ยังห้ามใช้ตัดสิน** (ทีม backend ยังไม่ยืนยันว่าเชื่อถือ 100%)
   * ให้ยึด `deviceStale` (shadow_ts) เป็นหลักในการตัดสินออฟไลน์ · `null` = ไม่รู้
   */
  readonly netpieStatus: number | null;
}

const INITIAL: LiveSnapshot = {
  status: 'mock',
  liveCount: 0,
  totalCount: 0,
  staleCount: 0,
  errorMessage: null,
  deviceStale: false,
  deviceLastSeenMs: null,
  deviceBanned: false,
  netpieStatus: null,
};

let current: LiveSnapshot = INITIAL;
const listeners = new Set<(s: LiveSnapshot) => void>();

function publish(next: LiveSnapshot): void {
  if (
    next.status === current.status &&
    next.liveCount === current.liveCount &&
    next.staleCount === current.staleCount &&
    next.totalCount === current.totalCount &&
    next.errorMessage === current.errorMessage &&
    next.deviceStale === current.deviceStale &&
    next.deviceLastSeenMs === current.deviceLastSeenMs &&
    next.deviceBanned === current.deviceBanned &&
    next.netpieStatus === current.netpieStatus
  ) {
    return;
  }
  current = next;
  for (const fn of listeners) fn(next);
}

/** ให้ตัวที่ subscribe telemetry รายงานสถานะเข้ามา */
export function reportLiveStatus(status: ConnectionStatus, errorMessage: string | null = null) {
  publish({ ...current, status, errorMessage });
}

/**
 * ให้ตัวที่แปลงข้อมูลสดเป็นค่าหน้าจอรายงานว่าจับคู่ได้กี่ค่า
 * แยกจาก `reportLiveStatus` เพราะคนละคนรู้ — socket รู้ว่าต่อติดไหม
 * ส่วน `FarmStateProvider` รู้ว่าค่าที่ไหลมาใช้ได้จริงกี่ตัว
 */
export function reportLiveCoverage(liveCount: number, totalCount: number, staleCount = 0): void {
  publish({ ...current, liveCount, totalCount, staleCount });
}

/**
 * ให้ `FarmStateProvider` (คนเดียวที่อ่าน shadow_ts) รายงานว่าอุปกรณ์ยัง "สด" ไหม
 * แยกจาก status ของ socket เพราะคนละเรื่อง — socket ต่อติด แต่ตัวอุปกรณ์อาจเงียบ
 */
export function reportDeviceFreshness(
  deviceStale: boolean,
  deviceLastSeenMs: number | null,
  deviceBanned = false,
  netpieStatus: number | null = null,
): void {
  publish({ ...current, deviceStale, deviceLastSeenMs, deviceBanned, netpieStatus });
}

export const getLiveStatus = (): ConnectionStatus => current.status;
export const getLiveSnapshot = (): LiveSnapshot => current;

/** ให้เทสรีเซ็ตกลับค่าเริ่มต้น — ไม่ใช้ในโค้ดจริง */
export function resetLiveStatusForTest(): void {
  current = INITIAL;
  listeners.clear();
}

function useSnapshot(): LiveSnapshot {
  const [snap, setSnap] = useState<LiveSnapshot>(current);
  useEffect(() => {
    // อ่านค่าล่าสุดอีกครั้งตอน mount กันกรณีมีคนรายงานไปก่อน effect นี้ทำงาน
    setSnap(current);
    listeners.add(setSnap);
    return () => {
      listeners.delete(setSnap);
    };
  }, []);
  return snap;
}

export const useLiveSnapshot = useSnapshot;

export function useLiveDataStatus(): ConnectionStatus {
  return useSnapshot().status;
}
