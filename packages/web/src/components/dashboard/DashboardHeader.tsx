import { ConnectionPill } from '@/components/common/ConnectionPill';
import { Icon } from '@/components/common/Icon';
import { useI18n } from '@/i18n/useI18n';
import g from '@/styles/dashboard.module.css';
import s from './dashboard.module.css';

export interface DashboardHeaderProps {
  readonly secondsSinceRead: number;
  readonly notifCount: number;
  readonly onToggleNotifications: () => void;
}

export function DashboardHeader({
  secondsSinceRead,
  notifCount,
  onToggleNotifications,
}: DashboardHeaderProps) {
  const { t, lang, setLang } = useI18n();
  const ago =
    secondsSinceRead < 60
      ? t.agoSec(secondsSinceRead)
      : t.agoMin(Math.floor(secondsSinceRead / 60));

  return (
    <header className={s.header}>
      <div style={{ minWidth: 0 }}>
        <h1 className={s.title}>{t.pageTitle}</h1>
        <div className={s.farmName}>{t.farmName}</div>
      </div>
      <div className={s.grow} />

      {/* พูดตามจริงว่าข้อมูลมาจากไหน — เดิมฝังคำว่า "ออนไลน์" ไว้ตายตัว */}
      <ConnectionPill ago={ago} />

      <div className={s.langGroup}>
        <button
          type="button"
          className={[s.langBtn, lang === 'th' ? s.langBtnOn : null].filter(Boolean).join(' ')}
          aria-pressed={lang === 'th'}
          onClick={() => setLang('th')}
        >
          ไทย
        </button>
        <button
          type="button"
          className={[s.langBtn, lang === 'en' ? s.langBtnOn : null].filter(Boolean).join(' ')}
          aria-pressed={lang === 'en'}
          onClick={() => setLang('en')}
        >
          EN
        </button>
      </div>

      <button
        type="button"
        className={s.iconBtn}
        aria-label={t.notifTitle}
        title={t.notifTitle}
        onClick={onToggleNotifications}
      >
        <Icon name="bell" size={19} />
        {/* ซ่อน badge เมื่อไม่มีแจ้งเตือน — เดิมโชว์ "0" ตลอด */}
        {notifCount > 0 ? <span className={`${s.badge} ${g.num}`}>{notifCount}</span> : null}
      </button>
    </header>
  );
}
