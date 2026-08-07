import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Toast } from '@/components/common';
import { StaleBanner } from '@/components/common/StaleBanner';
import { AppRail } from '@/components/layout/AppRail';
import { useRailState } from '@/components/layout/RailStateProvider';
import { ActivityLogCard } from '@/components/dashboard/ActivityLogCard';
import { AiChatDock } from '@/components/dashboard/AiChatDock';
import { CriticalBanner } from '@/components/dashboard/CriticalBanner';
import { DailySummary } from '@/components/dashboard/DailySummary';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { HeroOverview } from '@/components/dashboard/HeroOverview';
import { HistoryChart } from '@/components/dashboard/HistoryChart';
import { NotifPanel } from '@/components/dashboard/NotifPanel';
import { QuickAccess } from '@/components/dashboard/QuickAccess';
import { QuickAddModal } from '@/components/dashboard/QuickAddModal';
import { RecommendedActions } from '@/components/dashboard/RecommendedActions';
import { SensorCards } from '@/components/dashboard/SensorCards';
import { SensorHealthModal } from '@/components/dashboard/SensorHealthModal';
import { ThresholdModal } from '@/components/dashboard/ThresholdModal';
import { WeatherForecast } from '@/components/dashboard/WeatherForecast';
import { ZoneStatusStrip } from '@/components/dashboard/ZoneStatusStrip';
import { SOIL_STUCK_VALUE } from '@/data/dashboard';
import { QA_DEFAULT_KEY } from '@/data/mockActivityLog';
import type { LogCat } from '@/data/mockActivityLog';
import { useFarmState } from '@/state/FarmStateProvider';
import {
  useElapsedSeconds,
  useIntroProgress,
  useLiveSensors,
  useRetryableLoad,
} from '@/hooks/useDashboardData';
import { useFarmAlerts } from '@/hooks/useFarmAlerts';
import { useThresholds } from '@/hooks/useThresholds';
import { useToast } from '@/hooks/useToast';
import { useI18n } from '@/i18n/useI18n';
import { buildRecommendations } from '@/lib/recommendations';
import { useReducedMotion } from '@/lib/reducedMotion';
import { ROUTES } from '@/routePaths';
import g from '@/styles/dashboard.module.css';
import s from '@/components/dashboard/dashboard.module.css';

/**
 * แดชบอร์ดภาพรวมฟาร์ม
 *
 * ลำดับบนหน้า: Header → Critical Banner → Hero Overview → Sensor Cards → Zone Status Strip →
 * Recommended Actions → History Chart → Quick Access → Daily Summary → Activity Log
 * ตามด้วยแผงลอย: Notif · Sensor Health · Threshold · AI Chat
 *
 * ต้นแบบเรียง Recommended Actions → Hero → Zone Strip → Sensor Cards
 * เจ้าของงานสั่งสลับเป็นลำดับข้างบน (บันทึกไว้ใน docs/DESIGN_SOURCE.md ข้อ 11)
 */
export function DashboardPage() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { toast, flash } = useToast();
  const { collapsed, toggle: toggleCollapse } = useRailState();

  const [notifOpen, setNotifOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [healthAck, setHealthAck] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // สมุดบันทึกอยู่ใน provider (เริ่มว่าง · persist ข้ามหน้า)
  const { activityLogs, addActivityLog } = useFarmState();

  const live = useLiveSensors();
  const { loading, retry } = useRetryableLoad();
  /** ป้าย "อัปเดต … ที่แล้ว" รีเซ็ตตามค่าจริงล่าสุด ไม่ใช่ตอนเปิดหน้า */
  const secs = useElapsedSeconds(live.updatedAt);
  const progress = useIntroProgress(reduced);
  const th = useThresholds();
  /** แจ้งเตือน — อิงค่าจริงเมื่อ live · mock เมื่อ token หมด */
  const alerts = useFarmAlerts();

  /** ยังใช้กับเมนู "รายงาน"/"ตั้งค่า" ที่ยังไม่มีหน้า */
  const soon = useCallback(() => flash(t.soonToast), [flash, t]);
  /** ทุกทางลัดที่เกี่ยวกับการรดน้ำ (การ์ดโซน · สิ่งที่ควรทำ · ทางลัด) ไปหน้าเดียวกัน */
  const openIrrigation = useCallback(() => navigate(ROUTES.irrigation), [navigate]);

  /**
   * "สิ่งที่ควรทำตอนนี้" คำนวณจากค่าจริง + เกณฑ์ที่ผู้ใช้ตั้งไว้
   *
   * เดิมฝัง `soilB: 24` ไว้ตรงนี้ ซึ่งเป็นค่าความชื้นดินแหล่งที่สี่ของโปรเจกต์
   * ตอนนี้อ่านจาก provider เหมือนการ์ด — และเซนเซอร์ที่ยิงค่ามาจริงต้องไม่ถูกนับว่าค่าค้าง
   * ไม่งั้นหน้าจะแนะนำให้ "ไปเช็กเซนเซอร์ที่เสีย" ทั้งที่มันส่งค่ามาปกติ
   */
  const soilLive = live.liveFields.has('soil');
  const tempLive = live.liveFields.has('temp');
  const rhLive = live.liveFields.has('rh');
  const recommendations = useMemo(
    () =>
      buildRecommendations({
        soilB: live.soil ?? SOIL_STUCK_VALUE,
        soilThreshold: th.thresholds.soil,
        soilLive,
        stuckSensors: soilLive ? [] : ['soil'],
        temp: live.temp,
        rh: live.hum,
        tempLive,
        rhLive,
      }),
    [live.soil, soilLive, th.thresholds.soil, live.temp, live.hum, tempLive, rhLive],
  );

  const saveQuickAdd = (cat: LogCat, note: string) => {
    const title = note || t[QA_DEFAULT_KEY[cat]];
    addActivityLog({ cat, title, meta: t.qaJustNow, photo: false });
    setQuickAddOpen(false);
  };

  return (
    <div className={s.shell}>
      <AppRail
        currentPath={location.pathname}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        onSoon={soon}
        onFlash={flash}
      />

      <div className={s.main}>
        <div className={`${s.column} ${reduced ? '' : g.riselist}`}>
          <DashboardHeader
            secondsSinceRead={secs}
            notifCount={alerts.count}
            onToggleNotifications={() => setNotifOpen((v) => !v)}
          />

          {/* อุปกรณ์ออฟไลน์ → ทุกตัวเลขบนแดชบอร์ดเป็นค่าค้าง (แจ้งเตือน/สุขภาพฟาร์มก็คำนวณจากค่าค้าง) */}
          <StaleBanner />

          {/*
            แบนเนอร์เตือน — เจ้าของงานสั่งให้อยู่เหนือพยากรณ์อากาศ (เรื่องด่วนต้องเห็นก่อน)
            ต่อจริงแล้วโชว์ปัญหาวิกฤตจากค่าจริง · ยังไม่ต่อโชว์ข้อความ mock เดิม
            ต่อจริงแต่ไม่มีปัญหาวิกฤต = ไม่ขึ้นแบนเนอร์ (ไม่เตือนหลอกเรื่องเซนเซอร์ค้าง)
          */}
          <CriticalBanner
            show={!bannerDismissed && (alerts.isLive ? alerts.topCritical !== null : !healthAck)}
            title={alerts.isLive ? alerts.topCritical?.text : undefined}
            sub={alerts.isLive ? t.alertNow : undefined}
            onDetails={() => setHealthOpen(true)}
            onDismiss={() => setBannerDismissed(true)}
          />

          {/* พยากรณ์อากาศจริง + นาฬิกาไทย (ดึงไม่ได้ก็ไม่แสดง) */}
          <WeatherForecast />

          <HeroOverview progress={progress} />

          <SensorCards
            live={live}
            loading={loading}
            thresholds={th.thresholds}
            onOpenThreshold={th.open}
            onRetry={retry}
            animate={!reduced}
          />

          <ZoneStatusStrip irrigationReady onOpenZone={openIrrigation} />

          <RecommendedActions
            actions={recommendations}
            onAction={(a) =>
              navigate(a.route === 'greenhouse' ? ROUTES.greenhouse : ROUTES.irrigation)
            }
          />

          <HistoryChart animate={!reduced} />

          <QuickAccess
            onOpenIrrigation={openIrrigation}
            onOpenGreenhouse={() => navigate(ROUTES.greenhouse)}
          />

          <DailySummary />

          <ActivityLogCard entries={activityLogs} onQuickAdd={() => setQuickAddOpen(true)} />
        </div>
      </div>

      <NotifPanel open={notifOpen} onClose={() => setNotifOpen(false)} />

      <SensorHealthModal
        open={healthOpen}
        onClose={() => setHealthOpen(false)}
        onAcknowledge={() => {
          setHealthOpen(false);
          setHealthAck(true);
        }}
      />

      <ThresholdModal
        sensorKey={th.editing}
        current={th.current}
        onCancel={th.close}
        onSave={th.save}
      />

      <QuickAddModal
        open={quickAddOpen}
        onCancel={() => setQuickAddOpen(false)}
        onSave={saveQuickAdd}
      />

      <AiChatDock />
      <Toast message={toast} />
    </div>
  );
}
