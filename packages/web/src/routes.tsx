import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ROUTES } from '@/routePaths';
import { RouteFallback } from '@/components/layout/RouteFallback';

/**
 * แยกก้อนตามหน้า (route-level code splitting)
 *
 * ก่อนแยก: ก้อนเดียว 740 kB — เปิดหน้าไหนก็ต้องโหลดโค้ดของทุกหน้ารวมทั้งฉากเกม
 * ฉากเกมหนักที่สุด (เอฟเฟกต์ · ตัวละคร · พาร์ทิเคิล) แต่คนที่เปิดแดชบอร์ดไม่ได้ใช้เลย
 * บนไวไฟโรงเรือน/แท็บเล็ต ความต่างนี้รู้สึกได้จริงตอนเปิดครั้งแรก
 *
 * ⚠️ **ห้ามใส่ `lazy()` ไว้ในตัว component** — จะสร้าง type ใหม่ทุก render แล้ว React
 * unmount/mount หน้าใหม่ทุกครั้ง (state หาย · ฉากกะพริบ) ต้องอยู่ระดับโมดูลเท่านั้น
 */
const FarmScenePage = lazy(() =>
  import('@/pages/FarmScenePage').then((m) => ({ default: m.FarmScenePage })),
);
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const IrrigationPage = lazy(() =>
  import('@/pages/IrrigationPage').then((m) => ({ default: m.IrrigationPage })),
);
const GreenhousePage = lazy(() =>
  import('@/pages/GreenhousePage').then((m) => ({ default: m.GreenhousePage })),
);

export function AppRoutes() {
  return (
    /*
     * fallback ต้องเป็นโครงหน้าจางๆ ไม่ใช่สปินเนอร์กลางจอ
     * สปินเนอร์ทำให้จอกระพริบเป็นสีขาวแล้วเด้งกลับ ซึ่งรู้สึก "ช้ากว่า" ทั้งที่เร็วกว่า
     */
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path={ROUTES.farm} element={<FarmScenePage />} />
        <Route path={ROUTES.dashboard} element={<DashboardPage />} />
        <Route path={ROUTES.irrigation} element={<IrrigationPage />} />
        <Route path={ROUTES.greenhouse} element={<GreenhousePage />} />
        {/* url ที่ไม่รู้จัก (เช่นลิงก์เก่าของปฏิทิน) กลับมาที่ฉากฟาร์ม */}
        <Route path="*" element={<Navigate to={ROUTES.farm} replace />} />
      </Routes>
    </Suspense>
  );
}
