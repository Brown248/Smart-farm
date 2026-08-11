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
 * เมนูของหน้าจอข้อมูล — **ทุกรายการพาไปหน้าที่มีอยู่จริง ไม่มีปลายทางว่าง**
 *
 * ต้นแบบมี 6 รายการ (ปฏิทินดูแล · รายงาน · ตั้งค่า) เราเหลือ 4:
 *   · ตัด "ปฏิทินดูแล" ตามที่เจ้าของงานสั่ง (ไม่ทำแล้ว)
 *   · เพิ่ม "ฟาร์มเกม" ซึ่งไม่มีในต้นแบบ — หน้าข้อมูลในต้นแบบไม่มีทางกลับไปฉากเกมเลย
 *   · ตัด "รายงาน/ประวัติ" กับ "ตั้งค่า" ออก (เจ้าของงานสั่ง 2026-08-10)
 *
 * เหตุที่ตัดสองอันหลัง: ทั้งคู่ไม่มีต้นแบบและไม่มีแผนจะทำ เป็นป้าย "เร็วๆ นี้" ถาวร
 * ซึ่งกัดกินความเชื่อถือของป้ายอื่นในแอป · และของที่ควรอยู่ในนั้น**มีอยู่แล้วและหาเจอได้**
 * (ประวัติการสั่งงานอยู่ในลิ้นชักหน้าชลประทานและฉากเกม · กราฟย้อนหลัง/สมุดบันทึกอยู่แดชบอร์ด ·
 *  การตั้งค่าทุกอย่างอยู่ตรงจุดที่มันถูกใช้: เกณฑ์ที่การ์ด · แจ้งเตือนในลิ้นชัก · ภาษาที่หัวหน้า)
 *
 * `soon` ยังคงไว้ในโครงสร้างเผื่อวันหน้ามีหน้าใหม่ที่ยังทำไม่เสร็จจริงๆ
 * (บันทึกไว้ใน docs/DESIGN_SOURCE.md ข้อ 8 · 13 · 34)
 */
const RAIL_ITEMS: readonly RailItem[] = [
  { key: 'navDashboard', icon: 'dashboard', to: ROUTES.dashboard, soon: false },
  { key: 'navIrrigation', icon: 'zones', to: ROUTES.irrigation, soon: false },
  { key: 'navGreenhouse', icon: 'house', to: ROUTES.greenhouse, soon: false },
  { key: 'navFarmGame', icon: 'leaf', to: ROUTES.farm, soon: false },
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

      {/*
        เส้นคั่นก่อนกลุ่มล่าง — ทำให้ช่องว่างอ่านเป็น "การแบ่งกลุ่ม" ไม่ใช่ "เมนูหายไป"
        บนคือที่ไปหน้าต่างๆ · ล่างคือคำสั่งของทั้งระบบกับบัญชี ซึ่งเป็นคนละเรื่องกัน
      */}
      <div className={s.groupDivider} aria-hidden="true" />

      {/* วางหลัง spacer เพื่อไม่ให้ไปกวน `.navItem:nth-child(...)` ที่คุมจังหวะอนิเมชันเมนู */}
      <EmergencyStop collapsed={collapsed} onFlash={onFlash} />

      {/* เดิมฝังชื่อ "สมชาย ใจดี" ไว้ตายตัว — ตอนนี้เป็นบัญชีจริงที่ล็อกอินอยู่ */}
      <RailAccount collapsed={collapsed} />
    </nav>
  );
}
