import { BrowserRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n/I18nProvider';
import { RailStateProvider } from '@/components/layout/RailStateProvider';
import { FarmStateProvider } from '@/state/FarmStateProvider';
import { AppRoutes } from '@/routes';
import { DevTokenPanel } from '@/components/dev/DevTokenPanel';
import { parentOrigin } from '@/config/liveData';
import { startTokenProvider } from '@/services/tokenProvider';
import { startSupabaseAuth } from '@/services/supabaseAuth';

/**
 * เริ่มตรวจจับ access_token ก่อน render
 *
 * ต้องทำตอนโหลดโมดูล ไม่ใช่ใน `useEffect` เพราะทางที่ 1 คืออ่านจาก URL แล้ว
 * **ลบ token ออกจาก address bar ทันที** ยิ่งช้ายิ่งมีโอกาสที่ token ค้างใน history
 */
startTokenProvider(parentOrigin());

/**
 * แหล่งที่ 4 — session ของ Supabase ที่ผู้ใช้ล็อกอินไว้
 * เงียบไปเลยถ้ายังไม่ได้ตั้ง env ของ Supabase · ทางที่ 1–3 ยังทำงานได้ตามปกติ
 */
startSupabaseAuth();

export function App() {
  return (
    <I18nProvider>
      <FarmStateProvider>
        <RailStateProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
          {/*
            ช่องแปะ token เองสำหรับพัฒนา/เดโม — `import.meta.env.DEV` ถูกแทนเป็น `false`
            ตอน build production ทั้งกิ่งนี้จึงถูกตัดออกจาก bundle
            ⚠️ ห้ามถอดเงื่อนไขนี้ · `styles/devPanel.test.ts` ตรวจไว้
          */}
          {import.meta.env.DEV ? <DevTokenPanel /> : null}
        </RailStateProvider>
      </FarmStateProvider>
    </I18nProvider>
  );
}
