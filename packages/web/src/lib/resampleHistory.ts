import { telemetryNumber } from '@shared/telemetrySocket';
import type { HistoryPoint } from '@shared/telemetrySocket';

/**
 * แปลง `history_data` จริง → ค่าเรียงตามเวลาจำนวนคงที่ ให้กราฟเอาไปวาดได้
 *
 * **ทำไมต้อง resample** — backend ส่งจุดตามที่ ThingsBoard มี (ห่างไม่เท่ากัน · จำนวนไม่แน่นอน ·
 * **เรียงจากใหม่ไปเก่า** · ค่าเป็น string) แต่กราฟต้องการ `number[]` จำนวนเท่ากับช่องเวลาพอดี
 * (`RANGE_POINTS` เช่น day = 24 จุด) จึงต้องแบ่งช่วงเป็น N ถังเท่าๆ กันแล้วเฉลี่ยจุดในแต่ละถัง
 *
 * ถังที่ไม่มีจุดเลย → เอาค่าถังก่อนหน้ามาต่อ (carry-forward) เพื่อไม่ให้เส้นขาด
 * ไม่มีจุดที่ใช้ได้เลย → คืน `null` ให้ผู้เรียกตัดสินใจ (ปกติ fallback ไป mock)
 */
export function resampleHistory(
  points: readonly HistoryPoint[],
  startTs: number,
  endTs: number,
  buckets: number,
): number[] | null {
  if (buckets <= 0 || endTs <= startTs) return null;

  // แปลง string → number และทิ้งจุดที่ค่าเสีย/นอกช่วงเวลาออกก่อน
  const clean: { ts: number; value: number }[] = [];
  for (const p of points) {
    const v = telemetryNumber(p.value);
    if (v === null) continue;
    if (p.ts < startTs || p.ts > endTs) continue;
    clean.push({ ts: p.ts, value: v });
  }
  if (clean.length === 0) return null;

  // จัดจุดลงถังตามเวลา (แต่ละถังกว้างเท่ากัน)
  const span = endTs - startTs;
  const sums = new Array<number>(buckets).fill(0);
  const counts = new Array<number>(buckets).fill(0);
  for (const p of clean) {
    // จุดที่ ts === endTs ต้องไม่หลุดไปถัง buckets (เกินขอบ) จึง clamp
    const idx = Math.min(buckets - 1, Math.floor(((p.ts - startTs) / span) * buckets));
    sums[idx] = (sums[idx] ?? 0) + p.value;
    counts[idx] = (counts[idx] ?? 0) + 1;
  }

  // เฉลี่ยต่อถัง · ถังว่างเอาค่าก่อนหน้ามาต่อ · ถังต้นๆ ที่ยังว่างใช้ค่าจริงตัวแรกที่เจอ
  const out = new Array<number>(buckets);
  let last: number | null = null;
  for (let i = 0; i < buckets; i++) {
    const c = counts[i] ?? 0;
    if (c > 0) {
      last = (sums[i] ?? 0) / c;
    }
    out[i] = last ?? Number.NaN;
  }
  // ถังต้นๆ ที่ว่าง (ยังไม่เคยเจอค่า) เติมด้วยค่าจริงตัวแรกที่เจอ — ไม่ให้ขึ้นต้นด้วย NaN
  const firstReal = out.find((v) => !Number.isNaN(v));
  if (firstReal === undefined) return null;
  for (let i = 0; i < buckets; i++) {
    if (Number.isNaN(out[i])) out[i] = firstReal;
  }
  return out;
}
