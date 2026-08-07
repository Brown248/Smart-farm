import type { Ref } from 'react';
import { Button, Card, Gauge } from '@/components/common';
import { Icon } from '@/components/common/Icon';
import { useI18n } from '@/i18n/useI18n';
import type { HudCard } from '@/lib/status';
import { weatherLook } from '@/lib/weatherCode';
import type { Weather } from '@/hooks/useWeather';
import s from './WeatherHud.module.css';

export interface WeatherHudProps {
  readonly hudRef: Ref<HTMLDivElement>;
  readonly cards: readonly HudCard[];
  readonly clockLabel: string;
  /** อากาศจริงของฟาร์ม (null = ดึงไม่ได้ → ไม่โชว์การ์ดอากาศ) */
  readonly weather: Weather | null;
  /** เวลาไทยจริง HH:MM (Asia/Bangkok) */
  readonly timeLabel: string;
  /** ป้ายกลางวัน/กลางคืน ตามสภาพจริง */
  readonly dayNightLabel: string;
  /** ความกว้างของพื้นที่ฉาก ใช้ตัดสินว่าจะซ่อนแบรนด์ / ตัดเป็น 2×2 */
  readonly viewportWidth: number;
  readonly onOpenMenu: () => void;
}

/**
 * แถบค่าอากาศลอยทับฉาก สูงราว 44–48px ไม่มีแถบสีรองหลัง
 * เลย์เอาต์เดียวทุกจอ: แถวเดียว ยกเว้นจอแคบ (< 620px) ที่ตัดเป็น 2 คอลัมน์
 *
 * จำนวนคอลัมน์ผูกกับ `cards.length` ไม่ได้ fix ไว้ 4 — ต้นแบบมี 4 ใบ (รวม CO₂)
 * แต่ฟาร์มจริงไม่มีเซนเซอร์ CO₂ จึงตัดออกเหลือ 3 ใบ ถ้า fix ไว้ 4 จะเหลือช่องว่าง
 * ด้านขวาโดยไม่มีอะไรอยู่ และการ์ดจะแคบกว่าที่ควรเป็น
 */
export function WeatherHud({
  hudRef,
  cards,
  clockLabel,
  weather,
  timeLabel,
  dayNightLabel,
  viewportWidth,
  onOpenMenu,
}: WeatherHudProps) {
  const { t, lang, toggleLang } = useI18n();
  const narrow = viewportWidth < 620;
  const wxLook = weather ? weatherLook(weather.code) : null;

  return (
    <div ref={hudRef} className={s.bar} style={{ flexWrap: narrow ? 'wrap' : 'nowrap' }}>
      <Button variant="wood" className={s.menuBtn} aria-label={t.menuTitle} onClick={onOpenMenu}>
        <span className={s.menuBar} />
        <span className={s.menuBar} />
        <span className={s.menuBar} />
      </Button>

      <div className={s.brand} style={{ display: viewportWidth < 1024 ? 'none' : 'flex' }}>
        <strong className={s.brandName}>{t.brand}</strong>
        <span className={s.brandSub} style={{ display: viewportWidth < 1180 ? 'none' : 'block' }}>
          {t.house} · {clockLabel}
        </span>
      </div>

      <div
        className={s.cards}
        style={{
          flex: narrow ? '1 1 100%' : '1 1 0',
          gridTemplateColumns: `repeat(${narrow ? 2 : cards.length}, minmax(0, 1fr))`,
        }}
      >
        {cards.map((c) => (
          <Card key={c.key} variant="hud">
            <span
              className={s.sheen}
              aria-hidden="true"
              style={{ animation: `fsSheen 17s ease-in-out ${c.sheenDelay} infinite` }}
            />
            <Gauge deg={c.deg} color={c.color} title={c.label} />
            <div className={s.text}>
              <div className={s.label}>{c.label}</div>
              <div className={s.row}>
                <div className={s.value}>{c.value}</div>
                <div className={s.note}>
                  <span className={s.noteDot} style={{ background: c.color }} />
                  <span>{c.note}</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/*
        ต่อท้ายค่าความสว่าง: อากาศจริง แล้วตามด้วยนาฬิกาไทยจริง (ตามที่เจ้าของงานสั่ง)
        สองใบนี้เป็นข้อมูลอย่างเดียว ไม่กดได้ — คงหน้าตาเป็น hud card ให้เข้าชุดกับ gauge
      */}
      {wxLook && weather && (
        <Card variant="hud" className={s.chip}>
          <Icon name={wxLook.icon} size={26} color="var(--ink-wood)" strokeWidth={1.8} />
          <div className={s.chipText}>
            <div className={s.chipTop}>{Math.round(weather.tempC)}°</div>
            <div className={s.chipSub}>{t[wxLook.labelKey]}</div>
          </div>
        </Card>
      )}

      <Card variant="hud" className={s.chip}>
        <Icon name="clock" size={24} color="var(--ink-wood)" strokeWidth={1.8} />
        <div className={s.chipText}>
          <div className={s.chipTop}>{timeLabel}</div>
          <div className={s.chipSub}>{dayNightLabel}</div>
        </div>
      </Card>

      <Button variant="wood" className={s.langBtn} aria-label="TH / EN" onClick={toggleLang}>
        {lang === 'th' ? 'TH' : 'EN'}
      </Button>
    </div>
  );
}
