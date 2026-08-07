import { useState } from 'react';
import { LIVE_FIELDS } from '@/config/telemetryKeys';
import {
  getTokenSource,
  requestTokenRefresh,
  setManualToken,
  tokenProvider,
} from '@/services/tokenProvider';
import { signOut } from '@/services/supabaseAuth';
import { useFarmState } from '@/state/FarmStateProvider';
import s from './DevTokenPanel.module.css';

/**
 * อ่านเวลาหมดอายุจาก JWT (claim `exp`) โดยไม่ตรวจลายเซ็น — แค่ดูว่าหมดอายุยัง
 * เป็นเครื่องมือดีบัก ไม่ใช่การยืนยันความถูกต้องของ token
 */
function tokenHealth(): string {
  const tok = tokenProvider.getToken();
  if (!tok) return 'ไม่มี token — ยังไม่ได้ล็อกอิน';
  const body = tok.split('.')[1];
  if (body === undefined) return 'token รูปแบบไม่ใช่ JWT';
  try {
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    if (typeof payload.exp !== 'number') return 'token ไม่มี exp';
    const mins = Math.round((payload.exp * 1000 - Date.now()) / 60000);
    return mins > 0
      ? `token ใช้ได้อีก ${mins} นาที`
      : `token หมดอายุแล้ว ${-mins} นาที ← ปัญหาน่าจะอยู่ตรงนี้`;
  } catch {
    return 'อ่าน token ไม่ออก';
  }
}

/**
 * ทางที่ 3 — แปะ access_token เองตอนพัฒนา/เดโม
 *
 * ⚠️ **ต้องไม่หลุดไป production** ผู้เรียกต้องครอบด้วย `import.meta.env.DEV`
 * (ดู `App.tsx` — `styles/devPanel.test.ts` ตรวจว่ายังครอบอยู่จริง)
 *
 * ยังไม่ยืนยัน 100% ว่าทีม backend จะส่ง token ทางไหน ตัวนี้มีไว้ให้ทดสอบได้ก่อน
 * พอทีมยืนยันแล้วให้ลบทั้งโฟลเดอร์ `components/dev/` ทิ้ง
 */
export function DevTokenPanel() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const source = getTokenSource();
  const { live } = useFarmState();

  if (!open) {
    // ปุ่มเล็ก discreet — ไม่โชว์ token/source/live ให้รกมุมจอ (กดเพื่อกางแผงดีบัก)
    return (
      <button
        type="button"
        className={s.fab}
        onClick={() => setOpen(true)}
        aria-label="Dev token / connection"
        title={`dev · token: ${source} · live: ${live.fields.size}/${LIVE_FIELDS.length}`}
      >
        ⚙
      </button>
    );
  }

  return (
    <div className={s.panel} role="group" aria-label="Dev token">
      <div className={s.head}>
        <strong className={s.title}>แปะ access_token (dev)</strong>
        <button type="button" className={s.close} aria-label="ปิด" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>

      <p className={s.hint}>
        เฉพาะตอนพัฒนา — ปกติ token มาจาก URL (<code>?access_token=</code>) หรือ postMessage
        ของเว็บหลัก
      </p>

      <textarea
        className={s.input}
        rows={3}
        spellCheck={false}
        placeholder="eyJhbGciOi..."
        aria-label="access_token"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />

      <div className={s.actions}>
        <button
          type="button"
          className={s.clear}
          onClick={() => {
            setDraft('');
            setManualToken(null);
          }}
        >
          ล้าง
        </button>
        <button type="button" className={s.apply} onClick={() => setManualToken(draft)}>
          ใช้ token นี้
        </button>
      </div>

      <div className={s.source}>ที่มาปัจจุบัน: {source}</div>

      {/*
        สถานะจริงของการต่อ — เอาไว้ไล่ว่าทำไม "ขาดการเชื่อมต่อ"
        แยกให้เห็นชัด: token หมดอายุยัง · socket ต่อถึงไหน · error อะไร
      */}
      <div className={s.report}>
        <div className={s.reportHead}>สถานะการเชื่อมต่อ</div>
        <div className={s.row}>
          <span className={s.rowKey}>token</span>
          <span className={s.rowMiss}>{tokenHealth()}</span>
        </div>
        <div className={s.row}>
          <span className={s.rowKey}>socket</span>
          <span className={live.status === 'live' ? s.rowOk : s.rowMiss}>{live.status}</span>
        </div>
        {live.error !== null ? (
          <div className={s.row}>
            <span className={s.rowKey}>error</span>
            <span className={s.rowMiss}>{live.error}</span>
          </div>
        ) : null}

        <div className={s.actions}>
          <button type="button" className={s.clear} onClick={() => void requestTokenRefresh()}>
            ต่ออายุ token
          </button>
          <button
            type="button"
            className={s.clear}
            onClick={() => {
              setManualToken(null);
              void signOut();
            }}
          >
            ออกจากระบบ + ล้าง
          </button>
        </div>
      </div>

      {/*
        รายงานผลค้นหาชื่อ key — เดิมออกทาง `console.warn` เท่านั้น ซึ่งบนแท็บเล็ตเปิดอ่านยาก
        นี่คือข้อมูลที่ต้องใช้ตอนตั้งค่าครั้งแรก: device ยิง key ชื่ออะไรมาจริง
      */}
      <div className={s.report}>
        <div className={s.reportHead}>
          ค้นหา key · สถานะ {live.status}
          {live.error === null ? '' : ` — ${live.error}`}
        </div>

        {LIVE_FIELDS.map((field) => (
          <div key={field} className={s.row}>
            <span className={s.rowKey}>{field}</span>
            <span className={live.fields.has(field) ? s.rowOk : s.rowMiss}>
              {live.matched[field] ?? 'ยังไม่พบ'}
            </span>
          </div>
        ))}

        {live.unmatched.length > 0 ? (
          <div className={s.unmatched}>
            <strong>key ที่ยังจับคู่ไม่ได้</strong> — ถ้าตัวไหนคือค่าที่หน้าจอต้องใช้ ให้เติมเข้า{' '}
            <code>CLIMATE_KEY_RULES</code> / <code>SOIL_ALIASES</code>
            <div className={s.unmatchedList}>{live.unmatched.join(' · ')}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
