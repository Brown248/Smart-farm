import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AppRail } from './AppRail';
import { useRailState } from './RailStateProvider';
import { ConnectionPill } from '@/components/common/ConnectionPill';
import { StaleBanner } from '@/components/common/StaleBanner';
import { useI18n } from '@/i18n/useI18n';
import { useReducedMotion } from '@/lib/reducedMotion';
import g from '@/styles/dashboard.module.css';
import s from '@/components/dashboard/dashboard.module.css';

export interface DataPageProps {
  readonly title: string;
  readonly subtitle: string;
  /** วินาทีนับจากอ่านค่าล่าสุด — ไม่ส่งมา = ไม่โชว์บรรทัด "อัปเดต … ที่แล้ว" */
  readonly secondsSinceRead?: number | undefined;
  /** ปุ่มเพิ่มเติมท้าย header */
  readonly headerExtra?: ReactNode;
  readonly onSoon: () => void;
  /** ต่อ toast ของหน้าเข้ากับปุ่มหยุดฉุกเฉินในแถบเมนู */
  readonly onFlash: (message: string) => void;
  readonly children: ReactNode;
}

/**
 * โครงร่วมของหน้าจอข้อมูล: เมนูซ้าย + คอลัมน์กลาง + header มาตรฐาน
 * ใช้ซ้ำทั้ง Irrigation · Greenhouse · Calendar (แดชบอร์ดมี header ของตัวเองเพราะมีกระดิ่ง)
 */
export function DataPage({
  title,
  subtitle,
  secondsSinceRead,
  headerExtra,
  onSoon,
  onFlash,
  children,
}: DataPageProps) {
  const { t, lang, setLang } = useI18n();
  const location = useLocation();
  const reduced = useReducedMotion();
  const { collapsed, toggle: toggleCollapse } = useRailState();

  const ago =
    secondsSinceRead === undefined
      ? null
      : secondsSinceRead < 60
        ? t.agoSec(secondsSinceRead)
        : t.agoMin(Math.floor(secondsSinceRead / 60));

  return (
    <div className={s.shell}>
      <AppRail
        currentPath={location.pathname}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        onSoon={onSoon}
        onFlash={onFlash}
      />

      <div className={s.main}>
        <div className={`${s.column} ${reduced ? '' : g.riselist}`}>
          <header className={s.header}>
            <div style={{ minWidth: 0 }}>
              <h1 className={s.title}>{title}</h1>
              <div className={s.farmName}>{subtitle}</div>
            </div>
            <div className={s.grow} />

            {/* เดิมเขียน "ออนไลน์" ไว้ตายตัว ทั้งที่แอปไม่ได้ต่อกับอะไร — ป้ายนี้พูดตามจริง */}
            <ConnectionPill ago={ago} />

            <div className={s.langGroup}>
              <button
                type="button"
                className={[s.langBtn, lang === 'th' ? s.langBtnOn : null]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={lang === 'th'}
                onClick={() => setLang('th')}
              >
                ไทย
              </button>
              <button
                type="button"
                className={[s.langBtn, lang === 'en' ? s.langBtnOn : null]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={lang === 'en'}
                onClick={() => setLang('en')}
              >
                EN
              </button>
            </div>

            {headerExtra}
          </header>

          {/* เตือนทั้งหน้าเมื่ออุปกรณ์ออฟไลน์ — ค่าบนการ์ด/แผนที่เป็นค่าค้าง ไม่ใช่ของสด */}
          <StaleBanner />

          {children}
        </div>
      </div>
    </div>
  );
}
