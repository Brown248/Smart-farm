import { useNavigate } from 'react-router-dom';
import { Button, StatusDot } from '@/components/common';
import { useI18n } from '@/i18n/useI18n';
import { NAV_ITEMS } from '@/routePaths';
import { STATUS_COLOR } from '@/lib/status';
import type { LightMode, RainMode } from '@/hooks/useClock';
import s from './Sidebar.module.css';

export interface SidebarProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly currentPath: string;
  readonly lightMode: LightMode;
  readonly onCycleLight: () => void;
  readonly rainMode: RainMode;
  readonly onCycleRain: () => void;
  readonly presentation: boolean;
  readonly onTogglePresentation: () => void;
  /** ใช้แจ้งว่าหน้ายังไม่พร้อม แทนการพาไปหน้าเปล่า */
  readonly onSoon: () => void;
}

export function Sidebar({
  open,
  onClose,
  currentPath,
  lightMode,
  onCycleLight,
  rainMode,
  onCycleRain,
  presentation,
  onTogglePresentation,
  onSoon,
}: SidebarProps) {
  const { t, toggleLang } = useI18n();
  const navigate = useNavigate();

  if (!open) return null;

  const legend = [
    { color: STATUS_COLOR.ok, label: t.legendOk },
    { color: STATUS_COLOR.watering, label: t.legendWater },
    { color: STATUS_COLOR.low, label: t.legendLow },
    { color: STATUS_COLOR.critical, label: t.legendCrit },
  ];

  const lightLabel =
    lightMode === 'auto' ? t.lightAuto : lightMode === 'day' ? t.lightDay : t.lightNight;
  const rainLabel = rainMode === 'auto' ? t.rainAuto : rainMode === 'on' ? t.rainYes : t.rainNo;

  return (
    <div className={s.overlay}>
      <nav className={s.nav} aria-label={t.menuTitle}>
        <div className={s.heading}>{t.menuTitle}</div>

        {NAV_ITEMS.map((n) => {
          const active = n.to === currentPath;
          return (
            <button
              key={n.key}
              type="button"
              aria-current={active ? 'page' : undefined}
              className={[s.item, active ? s.itemActive : null, n.soon ? s.itemSoon : null]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                if (n.soon) {
                  onSoon();
                  return;
                }
                if (active || !n.to) {
                  onClose();
                  return;
                }
                navigate(n.to);
                onClose();
              }}
            >
              <span
                className={s.itemDot}
                aria-hidden="true"
                style={{
                  background: active
                    ? '#8fe0ad'
                    : n.soon
                      ? 'rgba(255,255,255,.25)'
                      : 'rgba(255,255,255,.5)',
                }}
              />
              <span>{t[n.key]}</span>
              <span className={s.grow} />
              {n.soon ? <span className={s.soonTag}>{t.soon}</span> : null}
            </button>
          );
        })}

        <div className={s.grow} />

        <div className={s.legend}>
          {legend.map((l) => (
            <div key={l.label} className={s.legendRow}>
              <StatusDot color={l.color} ringed />
              <span>{l.label}</span>
            </div>
          ))}
        </div>

        <div className={s.toggles}>
          <Button className={s.drawerBtn} onClick={onCycleLight}>
            {lightLabel}
          </Button>
          <Button className={s.drawerBtn} onClick={onCycleRain}>
            {rainLabel}
          </Button>
          <Button
            className={s.drawerBtn}
            onClick={onTogglePresentation}
            aria-pressed={presentation}
            style={presentation ? { background: '#e0a52e' } : undefined}
          >
            {presentation ? t.presOn : t.presOff}
          </Button>
        </div>

        <Button className={s.drawerBtn} onClick={toggleLang}>
          {t.langSwitch}
        </Button>
        <Button className={s.drawerBtn} onClick={onClose}>
          {t.closeMenu}
        </Button>
      </nav>

      <button type="button" className={s.scrim} aria-label={t.closeMenu} onClick={onClose} />
    </div>
  );
}
