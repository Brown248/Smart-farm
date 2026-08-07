import { Navigate, Route, Routes } from 'react-router-dom';
import { ROUTES } from '@/routePaths';
import { FarmScenePage } from '@/pages/FarmScenePage';
import { DashboardPage } from '@/pages/DashboardPage';
import { IrrigationPage } from '@/pages/IrrigationPage';
import { GreenhousePage } from '@/pages/GreenhousePage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.farm} element={<FarmScenePage />} />
      <Route path={ROUTES.dashboard} element={<DashboardPage />} />
      <Route path={ROUTES.irrigation} element={<IrrigationPage />} />
      <Route path={ROUTES.greenhouse} element={<GreenhousePage />} />
      {/* url ที่ไม่รู้จัก (เช่นลิงก์เก่าของปฏิทิน) กลับมาที่ฉากฟาร์ม */}
      <Route path="*" element={<Navigate to={ROUTES.farm} replace />} />
    </Routes>
  );
}
