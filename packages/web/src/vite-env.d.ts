/// <reference types="vite/client" />

/**
 * env ของเว็บ — ทุกตัวเป็น optional เพราะแอปต้องเปิดได้แม้ยังไม่ตั้งค่า
 *
 * อ่านผ่าน `config/liveData.ts` ที่เดียว ห้ามอ่าน `import.meta.env` กระจายในหน้าเพจ
 * ไม่งั้นจะกลับไปเป็นปัญหาเดิม: ค่าเดียวกันถูกอ่านหลายที่แล้วตีความไม่เหมือนกัน
 *
 * token มาได้ 4 ทาง — ดู `services/tokenProvider.ts`
 * (URL · postMessage · กรอกเองโหมด dev · Supabase ที่ผู้ใช้ล็อกอินเอง)
 */
interface ImportMetaEnv {
  /** origin ของ backend ทีม — **ไม่รวม** namespace `/telemetry` โค้ดต่อให้เอง */
  readonly VITE_WS_URL?: string;
  /** โดเมนเว็บหลักที่ยอมรับ `postMessage` จาก — ว่าง = ไม่รับเลย */
  readonly VITE_PARENT_ORIGIN?: string;
  /** Supabase — ให้ผู้ใช้ล็อกอินเอาเอง (anon key เป็น public โดยการออกแบบ) */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_FARM_DEVICE_ID?: string;
  readonly VITE_FARM_ORG_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
