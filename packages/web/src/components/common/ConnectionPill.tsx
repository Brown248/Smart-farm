import { useEffect, useState } from 'react';
import type { ConnectionStatus } from '@/hooks/useTelemetry';
import { isAuthConfigured, isLiveConfigured } from '@/config/liveData';
import { useLiveSnapshot } from '@/state/liveStatus';
import { useI18n } from '@/i18n/useI18n';
import type { TextKey } from '@/i18n/keys';
import s from './ConnectionPill.module.css';

export interface ConnectionPillProps {
  /** "อัปเดตเมื่อ N วินาทีที่แล้ว" — ส่งมาเฉพาะตอนข้อมูลสด */
  readonly ago?: string | null | undefined;
}

interface Look {
  readonly labelKey: TextKey;
  readonly cls: string;
  /** เต้นเบาๆ เฉพาะตอนกำลังพยายามต่อ ไม่ใช่ตอนนิ่งแล้ว */
  readonly pulse: boolean;
}

const LOOK: Readonly<Record<ConnectionStatus, Look>> = {
  live: { labelKey: 'connLive', cls: 'live', pulse: true },
  connecting: { labelKey: 'connConnecting', cls: 'busy', pulse: true },
  reconnecting: { labelKey: 'connReconnecting', cls: 'busy', pulse: true },
  offline: { labelKey: 'connOffline', cls: 'offline', pulse: false },
  mock: { labelKey: 'connMock', cls: 'mock', pulse: false },
};

/**
 * ป้ายบอกว่าข้อมูลบนหน้าจอมาจากไหน
 *
 * เดิม header ฝังคำว่า "ออนไลน์" ไว้ตายตัว ซึ่งไม่จริง — แอปไม่ได้ต่อกับอะไรเลย
 * ป้ายนี้พูดตามจริง: `ข้อมูลจำลอง` จนกว่าจะมีตัว subscribe telemetry รายงานว่าต่อติดแล้ว
 *
 * อ่านสถานะจาก store ระดับโมดูล (`state/liveStatus.ts`) ไม่เปิด socket ของตัวเอง
 */
export function ConnectionPill({ ago }: ConnectionPillProps) {
  const { t } = useI18n();
  const {
    status,
    liveCount,
    totalCount,
    errorMessage,
    deviceStale,
    deviceLastSeenMs,
    deviceBanned,
  } = useLiveSnapshot();
  const look = LOOK[status];
  // ถูกระงับ (netpie_banned) สำคัญกว่า "ค่าค้าง" — ผู้ใช้แก้เองไม่ได้
  const banned = status === 'live' && deviceBanned;

  /*
   * socket ต่อติด (`live`) แต่ตัวอุปกรณ์เงียบเกินเกณฑ์ (shadow_ts เก่า) = ค่าบนจอเป็น "ค่าค้าง"
   * ต้องเด้งขึ้นก่อนทุกกรณี — ถ้าโชว์ "ข้อมูลสด · อัปเดต 1 วิ" ทั้งที่อุปกรณ์ออฟไลน์ = หลอกอันตราย
   * เดินนาฬิกาเองทุก 20 วิ ตอนค้าง เพื่อให้ตัวเลข "นาที" ขยับ (store publish แค่ตอนพลิกสถานะ)
   */
  const stale = status === 'live' && deviceStale;
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!stale) return;
    const id = window.setInterval(() => forceTick((x) => x + 1), 20_000);
    return () => window.clearInterval(id);
  }, [stale]);
  const staleMins =
    stale && deviceLastSeenMs !== null
      ? String(Math.max(1, Math.round((Date.now() - deviceLastSeenMs) / 60_000)))
      : null;

  /*
   * ต่อติดไม่ได้แปลว่าได้ค่าครบ — device อาจยิงมาแค่บางค่า หรือยังไม่ยิงอะไรมาเลย
   * ป้ายที่เขียน "ข้อมูลสด" เฉยๆ จะทำให้เข้าใจว่าทุกเลขบนจอเป็นของจริง ซึ่งไม่จริง
   * จึงแยก 3 กรณี: ครบ · บางส่วน (บอกสัดส่วน) · ต่อติดแต่ยังไม่มีค่าเลย (นับเป็นสถานะรอ)
   *
   * หมายเหตุ: เคยมีกรณี "ค่าค้างหมดทุกตัว" ด้วย — **เป็นไปไม่ได้แล้ว** เพราะตัวจับค่าค้าง
   * เทียบ timestamp กันเองในสตรีม ค่าที่ใหม่ที่สุดจึงไม่มีวันถูกหาว่าค้าง (ดู `staleFields`)
   * ถ้าอุปกรณ์เงียบพร้อมกันหมด `deviceStale` (shadow_ts) เป็นคนบอกแทน
   */
  const noData = status === 'live' && liveCount === 0;
  const partial = status === 'live' && liveCount > 0 && liveCount < totalCount;
  const label = banned
    ? t.connDeviceBanned
    : stale
      ? t.connDeviceStale
      : noData
        ? t.connNoData
        : partial
          ? t.connPartial
          : (t[look.labelKey] as string);
  const cls = banned || stale ? 'offline' : noData ? 'busy' : look.cls;
  const pulse = banned || stale ? false : look.pulse;
  const coverage =
    status === 'live' && totalCount > 0 ? t.connCoverage(liveCount, totalCount) : null;
  const detail = banned
    ? ''
    : stale
      ? staleMins
        ? t.connStaleAgo(staleMins)
        : ''
      : [coverage, status === 'live' ? ago : null].filter(Boolean).join(' · ');

  /*
   * "ข้อมูลจำลอง" มีได้ 2 เหตุ แต่เดิมขึ้นข้อความเดียวกันทำให้เข้าใจผิด:
   *   - env ครบแล้วแต่ยังไม่ล็อกอิน → บอกให้ "ล็อกอิน" (ทางแก้อยู่ที่ผู้ใช้)
   *   - env ยังไม่ครบ → บอกว่า "ยังไม่ตั้งค่า" (ทางแก้อยู่ที่ผู้ตั้งระบบ)
   */
  const mockHint = isLiveConfigured() && isAuthConfigured() ? t.connMockLogin : t.connMockHint;

  return (
    <div
      className={[s.pill, s[cls]].filter(Boolean).join(' ')}
      title={status === 'mock' ? mockHint : (errorMessage ?? label)}
    >
      <span
        className={[s.dot, pulse ? s.dotPulse : null].filter(Boolean).join(' ')}
        aria-hidden="true"
      />
      <span className={s.text}>
        <span className={s.label}>{label}</span>
        {status === 'live' && detail !== '' ? <span className={s.ago}>{detail}</span> : null}
        {status === 'mock' ? <span className={s.ago}>{mockHint}</span> : null}
        {status !== 'mock' && status !== 'live' && errorMessage !== null ? (
          <span className={s.ago}>{errorMessage}</span>
        ) : null}
      </span>
    </div>
  );
}
