/**
 * ส่งคำสั่ง HandySense จริง + จับคู่ผลกลับด้วย reqId (เอกสารข้อ 3-4, 10)
 *
 * แยกเป็น 3 ส่วนที่ทดสอบแยกกันได้:
 *   newReqId()       — สร้าง id ไม่ซ้ำทุกครั้ง (กันคำสั่งหายเงียบ · จุดพลาดอันดับ 1)
 *   postHsCommand()  — POST attributes พร้อม Bearer token · คืนเมื่อ backend รับไว้ (200)
 *   createHsTracker()— รอ cmd_result ที่ reqId ตรงกัน · ครบ 15 วิ = "ไม่ทราบผล"
 *
 * ⚠️ POST 200 = "รับคำสั่งไว้แล้ว" ไม่ใช่ "สำเร็จ" — สถานะจริงต้องอ่านจาก led อีกที
 */
import { buildAttributesBody, HS_RESULT_TIMEOUT_MS, type HsCommand } from '@shared/handysense';
import type { CommandResult } from '@/config/commandResult';
import { apiBaseUrl, readLiveDataConfig } from '@/config/liveData';
import { tokenProvider } from './tokenProvider';

/**
 * reqId ต้องไม่ซ้ำทุกครั้ง — จำเป็น 2 เหตุผล (เอกสารข้อ 3):
 *   1. จับคู่ผลที่กลับมาว่าเป็นของ request ตัวเอง
 *   2. ทำให้ค่า attribute ไม่ซ้ำ (ส่งค่าเดิมเป๊ะ ระบบอาจไม่ trigger → คำสั่งหายเงียบ)
 * ต่อให้ผู้ใช้กดปุ่มเดิมสองครั้งก็ต้องได้ reqId ใหม่
 */
export function newReqId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface HsPostContext {
  /** เช่น https://backend-prod.synexta.ai/api/v1 (จาก config/liveData.apiBaseUrl) */
  readonly apiBase: string;
  readonly deviceId: string;
  /** access_token จาก tokenProvider ตัวเดียวของทั้งระบบ (Bearer เดียวกับ socket) */
  readonly token: string;
}

/**
 * รวม config + token ที่จำเป็นต่อการยิงคำสั่ง · คืน `null` ถ้ายังไม่พร้อม
 * (env ไม่ครบ หรือยังไม่ล็อกอิน) → ผู้เรียกต้องไม่ส่งคำสั่งจริง
 */
export function readHsContext(): HsPostContext | null {
  const apiBase = apiBaseUrl();
  const cfg = readLiveDataConfig();
  const token = tokenProvider.getToken();
  if (apiBase === null || cfg === null || token === null) return null;
  return { apiBase, deviceId: cfg.deviceId, token };
}

/** ยิงคำสั่งไป backend · โยน error ถ้า HTTP ไม่ใช่ 2xx (เช่น token หมดอายุ / route ผิด) */
export async function postHsCommand(
  ctx: HsPostContext,
  cmd: HsCommand,
  reqId: string,
): Promise<void> {
  const url = `${ctx.apiBase}/devices/${ctx.deviceId}/attributes`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.token}`,
      },
      body: JSON.stringify(buildAttributesBody(cmd, reqId)),
    });
  } catch (e) {
    // fetch reject เอง = network/CORS (เบราว์เซอร์บล็อก) — Node ยิงผ่านแต่เบราว์เซอร์ไม่ผ่าน = CORS
    console.warn('[HandySense] POST network/CORS error →', url, e);
    throw e;
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* ไม่มี body ก็ไม่เป็นไร */
    }
    console.warn('[HandySense] POST failed', res.status, url, body.slice(0, 200));
    throw new Error(`hs-post-failed:${res.status}`);
  }
  // 200 = รับคำสั่งไว้แล้ว · ผลจริงมาทาง cmd_result เท่านั้น
}

/** เหตุที่ track ล้มเหลว — timeout (ไม่ทราบผล) หรือ device ตอบ ok:false */
export type HsTrackFailure =
  { readonly kind: 'timeout' } | { readonly kind: 'failed'; readonly result: CommandResult };

export class HsTrackError extends Error {
  readonly failure: HsTrackFailure;
  constructor(failure: HsTrackFailure) {
    super(failure.kind === 'timeout' ? 'hs-timeout' : 'hs-failed');
    this.failure = failure;
  }
}

interface HsPending {
  readonly resolve: (r: CommandResult) => void;
  readonly reject: (e: HsTrackError) => void;
  readonly timer: number;
}

/**
 * ตัวจับคู่ reqId → ผล · ป้อน cmd_result ที่ไหลเข้ามาผ่าน `feed()`
 * ไม่ผูกกับ React — ทดสอบได้ตรงๆ · ผู้เรียก (provider/hook) เป็นคนต่อกับ live.command
 */
export function createHsTracker(timeoutMs: number = HS_RESULT_TIMEOUT_MS) {
  const pending = new Map<string, HsPending>();

  /** รอผลของ reqId นี้ · resolve เมื่อ ok:true · reject (timeout/failed) อย่างอื่น */
  function track(reqId: string): Promise<CommandResult> {
    return new Promise<CommandResult>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pending.delete(reqId);
        reject(new HsTrackError({ kind: 'timeout' }));
      }, timeoutMs);
      pending.set(reqId, { resolve, reject, timer });
    });
  }

  /**
   * ป้อนผลที่ได้จาก cmd_result · ไม่ตรง reqId ที่รออยู่ = ข้าม (ไม่ใช่ของเรา หรือ timeout ไปแล้ว)
   * เอกสารข้อ 4: reqId ไม่ตรงให้ข้าม
   */
  function feed(result: CommandResult | null | undefined): void {
    if (!result || !result.reqId) return;
    const p = pending.get(result.reqId);
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.delete(result.reqId);
    if (result.ok) p.resolve(result);
    else p.reject(new HsTrackError({ kind: 'failed', result }));
  }

  /** ยกเลิกทุก request ที่ค้าง (ตอน unmount) — reject เป็น timeout ให้ผู้รอไม่ค้าง */
  function clear(): void {
    for (const p of pending.values()) {
      window.clearTimeout(p.timer);
      p.reject(new HsTrackError({ kind: 'timeout' }));
    }
    pending.clear();
  }

  return { track, feed, clear, pendingCount: (): number => pending.size };
}

export type HsTracker = ReturnType<typeof createHsTracker>;
