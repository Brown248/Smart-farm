import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/common/Icon';
import type { IconName } from '@/components/common/Icon';
import { EmergencyStop } from './EmergencyStop';
import { RailAccount } from '@/components/auth/RailAccount';
import { useI18n } from '@/i18n/useI18n';
import type { TextKey } from '@/i18n/keys';
import { ROUTES } from '@/routePaths';
import s from './AppRail.module.css';

interface RailItem {
  readonly key: TextKey;
  readonly icon: IconName;
  readonly to: string | null;
  readonly soon: boolean;
}

/**
 * เมนูของหน้าจอข้อมูล — ต้นแบบมี 6 รายการ (มี "ปฏิทินดูแล" ด้วย)
 * หน้าที่ยังไม่ได้ทำตั้ง `soon` ไว้ กดแล้วขึ้น toast แทนการพาไปหน้าเปล่า
 *
 * ตัด "ปฏิทินดูแล" ออกตามที่เจ้าของงานสั่ง (ไม่ทำแล้ว)
 * และเพิ่ม "ฟาร์มเกม" ซึ่งไม่มีในต้นแบบ — หน้าข้อมูลในต้นแบบไม่มีทางกลับไปฉากเกมเลย
 * (บันทึกไว้ใน docs/DESIGN_SOURCE.md ข้อ 8 และ 13)
 */
const RAIL_ITEMS: readonly RailItem[] = [
  { key: 'navDashboard', icon: 'dashboard', to: ROUTES.dashboard, soon: false },
  { key: 'navIrrigation', icon: 'drop', to: ROUTES.irrigation, soon: false },
  { key: 'navGreenhouse', icon: 'house', to: ROUTES.greenhouse, soon: false },
  { key: 'navFarmGame', icon: 'leaf', to: ROUTES.farm, soon: false },
  { key: 'navReports', icon: 'reports', to: null, soon: true },
  { key: 'navSettings', icon: 'settings', to: null, soon: true },
];

export interface AppRailProps {
  readonly currentPath: string;
  readonly collapsed: boolean;
  readonly onToggleCollapse: () => void;
  readonly onSoon: () => void;
  /** ให้ปุ่มหยุดฉุกเฉินแจ้งผลผ่าน toast ของหน้าที่กำลังเปิดอยู่ */
  readonly onFlash: (message: string) => void;
}

export function AppRail({
  currentPath,
  collapsed,
  onToggleCollapse,
  onSoon,
  onFlash,
}: AppRailProps) {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <nav
      className={[s.side, collapsed ? s.collapsed : null].filter(Boolean).join(' ')}
      aria-label="Syntech"
    >
      <div className={s.brandRow}>
        <span className={s.brandMark}>
          {/* โลโก้จริงพื้นขาว — rail เป็น #fff จึงใช้ mix-blend-mode: multiply ตัดพื้นขาวออก
              (ดู .brandLogo) เหลือแต่ตัวมาร์ก เขียว/เหลือง โดยไม่ต้องแก้ไฟล์รูป */}
          <img
            src="/assets/logo.png"
            alt="Syntech"
            className={s.brandLogo}
            width={40}
            height={40}
          />
        </span>
        <span className={s.brandText}>
          <span className={s.brandName}>Syntech</span>
          <span className={s.brandSub}>SMART FARM</span>
        </span>
        <button
          type="button"
          className={s.collapseBtn}
          aria-label={t.toggleMenu}
          aria-expanded={!collapsed}
          title={t.toggleMenu}
          onClick={onToggleCollapse}
        >
          <span
            className={[s.chevron, collapsed ? s.chevronFlipped : null].filter(Boolean).join(' ')}
          >
            <Icon name="chevronLeft" size={16} strokeWidth={2} />
          </span>
        </button>
      </div>

      {RAIL_ITEMS.map((item) => {
        const active = item.to === currentPath;
        return (
          <button
            key={item.key}
            type="button"
            aria-current={active ? 'page' : undefined}
            className={[s.navItem, active ? s.navItemOn : null].filter(Boolean).join(' ')}
            onClick={() => {
              if (item.soon || !item.to) {
                onSoon();
                return;
              }
              if (!active) navigate(item.to);
            }}
          >
            <span className={s.navIcon}>
              <Icon name={item.icon} size={19} />
            </span>
            <span className={s.navLabel}>{t[item.key]}</span>
            {item.soon ? <span className={s.soonTag}>{t.comingSoon}</span> : null}
          </button>
        );
      })}

      <div className={s.spacer} />

      {/* วางหลัง spacer เพื่อไม่ให้ไปกวน `.navItem:nth-child(2..6)` ที่คุมจังหวะอนิเมชันเมนู */}
      <EmergencyStop collapsed={collapsed} onFlash={onFlash} />

      {/* เดิมฝังชื่อ "สมชาย ใจดี" ไว้ตายตัว — ตอนนี้เป็นบัญชีจริงที่ล็อกอินอยู่ */}
      <RailAccount collapsed={collapsed} />
    </nav>
  );
}
