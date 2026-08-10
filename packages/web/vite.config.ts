import { fileURLToPath, URL } from 'node:url';
// `defineConfig` มาจาก vitest เพราะไฟล์นี้มีบล็อก `test` ด้วย — ของ vite เปล่าไม่รู้จัก key นั้น
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// เปิด HTTPS ให้ dev server (cert self-signed สร้างอัตโนมัติ) — ให้เปิดจากวง LAN ได้ที่ https://<ip>:5173
// (เบราว์เซอร์จะเตือน "ไม่ปลอดภัย" เพราะ cert เซ็นเอง กด "ดำเนินการต่อ" ได้ · ใช้ในวงบริษัทเท่านั้น)
import basicSsl from '@vitejs/plugin-basic-ssl';

/** ชื่อ env ที่แอปใช้ — ถ้าเจอชื่อพวกนี้แบบไม่มี prefix ให้เตือน */
const NEEDS_PREFIX = [
  'WS_URL',
  'PARENT_ORIGIN',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'FARM_DEVICE_ID',
  'FARM_ORG_ID',
] as const;

/**
 * เตือนตอนสตาร์ตถ้าใน `.env` มีค่าที่ **ลืมใส่ prefix `VITE_`**
 *
 * Vite จะไม่ส่งตัวแปรที่ไม่มี prefix ไปให้เบราว์เซอร์เลย — **ไม่มี error ไม่มีคำเตือน**
 * ค่านั้นหายไปเงียบๆ แอปเลยคิดว่า "ยังไม่ได้ตั้งค่า" แล้วใช้ข้อมูลจำลองต่อ
 * เกิดมาแล้ว 2 ครั้งกับ `SUPABASE_URL` และ `SUPABASE_ANON_KEY` — ครั้งหลังเสียเวลาไล่หา
 * เพราะอาการหน้าตาเหมือนคีย์ผิด (dashboard ของ Supabase ก็แสดงชื่อแบบไม่มี prefix)
 */
function warnUnprefixedEnv(): Plugin {
  return {
    name: 'syntech-warn-unprefixed-env',
    configResolved(config) {
      // '' = โหลดทุกตัวไม่กรอง prefix — ปกติ Vite กรองเหลือแต่ VITE_*
      const all = loadEnv(config.mode, config.envDir ?? config.root, '');
      const stray = NEEDS_PREFIX.filter(
        (name) => all[name] !== undefined && all[`VITE_${name}`] === undefined,
      );
      for (const name of stray) {
        config.logger.warn(
          `[env] พบ "${name}" ใน .env แต่ไม่มี "VITE_${name}" — Vite จะไม่อ่านค่าที่ไม่มี prefix ` +
            `VITE_ แอปจะใช้ข้อมูลจำลองต่อโดยไม่ฟ้องอะไร ให้เปลี่ยนชื่อเป็น VITE_${name}`,
          { timestamp: true },
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // ปลายทาง backend สำหรับ dev proxy — อ่านจาก env เดียวกับที่แอปใช้ (ไม่ hardcode)
  const root = fileURLToPath(new URL('.', import.meta.url));
  const env = loadEnv(mode, root);
  const backend = (env.VITE_WS_URL ?? '').replace(/\/+$/, '').replace(/\/telemetry$/, '');
  /*
   * ปลายทางเครื่อง AI สำหรับ dev proxy — ตั้งใน `.env` เป็น `AI_ORIGIN` (ไม่ต้องมี prefix VITE_)
   * **ตั้งใจไม่ให้มี prefix** เพราะค่านี้ไม่ควรถูกฝังลงไฟล์ JS ของเบราว์เซอร์
   * ฝั่งหน้าเว็บรู้จักแค่ path `/ai-proxy` เท่านั้น (ดู `config/liveData.readAiConfig`)
   */
  // 🔴 ต้องส่ง prefix เป็น `''` — `loadEnv(mode, root)` คืนเฉพาะตัวที่ขึ้นต้น `VITE_`
  // ถ้าลืม `AI_ORIGIN` จะเป็น undefined เงียบๆ แล้ว proxy ไม่ถูกสร้าง (คำขอได้ 404 โดยไม่มีคำเตือน)
  const ai = (loadEnv(mode, root, '').AI_ORIGIN ?? '').replace(/\/+$/, '');

  return {
    plugins: [react(), basicSsl(), warnUnprefixedEnv()],
    resolve: {
      alias: {
        '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    /**
     * `host: true` = ฟังทุก network interface (0.0.0.0) ไม่ใช่แค่ localhost
     * ดีฟอลต์ของ Vite ผูกกับ localhost อย่างเดียว เครื่องอื่นในวงจึงเปิดไม่ได้
     * เปิดแบบนี้แล้วใช้ได้ทั้ง http://localhost:5173 และ http://<ip เครื่องนี้>:5173
     *
     * ไม่ hardcode IP ไว้ตรงนี้เพราะ IP มาจาก DHCP เปลี่ยนได้ และถ้าใส่ IP เดียว
     * localhost จะเปิดไม่ได้ ส่วนคนอื่นในทีมที่ IP ไม่ตรงก็รันไม่ขึ้น
     *
     * `strictPort` = ถ้าพอร์ต 5173 ไม่ว่างให้ error ไปเลย ห้ามเงียบๆ ย้ายไป 5174
     * ไม่งั้น URL ที่ bookmark ไว้บนแท็บเล็ตจะเปิดไม่ติดโดยไม่รู้สาเหตุ
     */
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      /**
       * proxy คำสั่งจริง (REST POST attributes) ผ่าน dev server เอง = same-origin เลี่ยง CORS
       *
       * เบราว์เซอร์บล็อก POST ข้าม origin ไป backend-prod (ไม่มี `Access-Control-Allow-Origin`)
       * แต่ Node/dev server ไม่ติด CORS → forward ให้ฝั่ง server แทน
       * `apiBaseUrl()` จึงคืน `/hs-proxy/api/v1` ตอน dev · **นี่แค่ workaround ตอนพัฒนา**
       * production ต้องให้ backend เปิด CORS ให้ origin ของเว็บเอง
       */
      proxy: {
        ...(backend
          ? {
              '/hs-proxy': {
                target: backend,
                changeOrigin: true,
                secure: true,
                rewrite: (p) => p.replace(/^\/hs-proxy/, ''),
              },
            }
          : {}),
        /**
         * ผู้ช่วย AI — **จำเป็นต้อง proxy ไม่ใช่แค่เลี่ยง CORS**
         *
         * dev server เป็น HTTPS (basic-ssl) แต่เครื่อง AI เป็น `http://` ธรรมดา
         * เบราว์เซอร์บล็อกคำขอ HTTP ที่ออกจากหน้า HTTPS (mixed content) — ยิงตรงไม่มีทางผ่าน
         * `secure: false` เพราะปลายทางเป็น http ในวง LAN ไม่มี cert ให้ตรวจ
         */
        ...(ai
          ? {
              '/ai-proxy': {
                target: ai,
                changeOrigin: true,
                secure: false,
                rewrite: (p) => p.replace(/^\/ai-proxy/, ''),
              },
            }
          : {}),
      },
    },
    preview: { host: true, port: 4173, strictPort: true },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      include: ['src/**/*.test.{ts,tsx}'],
      /**
       * ล้าง env ของการต่อข้อมูลจริงทิ้งตอนรันเทส
       *
       * Vite โหลด `.env` ให้ vitest ด้วย → เทสจะเปลี่ยนพฤติกรรมตามว่าเครื่องนั้นตั้งค่าอะไรไว้
       * (เจอจริง: พอใส่ค่า Supabase ปุ่ม "เข้าสู่ระบบ" โผล่มา แล้วเทสนับเมนูพัง
       *  ทั้งที่โค้ดไม่ได้เปลี่ยน — และจะพังคนละแบบระหว่างเครื่องนักพัฒนากับ CI)
       *
       * ค่าเริ่มต้นของเทสจึงเป็น "ยังไม่ได้ตั้งค่า" เสมอ = เส้นทาง mock fallback
       * เทสที่อยากทดสอบโหมดต่อจริงให้ mock `@/config/liveData` เอาเอง (ทำแบบนั้นอยู่แล้ว)
       */
      env: {
        VITE_WS_URL: '',
        VITE_PARENT_ORIGIN: '',
        VITE_SUPABASE_URL: '',
        VITE_SUPABASE_ANON_KEY: '',
        VITE_FARM_DEVICE_ID: '',
        VITE_FARM_ORG_ID: '',
      },
    },
  };
});
