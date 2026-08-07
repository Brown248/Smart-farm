import { Icon } from '@/components/common/Icon';
import { useWeather } from '@/hooks/useWeather';
import { useClock } from '@/hooks/useClock';
import { weatherLook } from '@/lib/weatherCode';
import { dateShortBangkok, hhmmBangkok } from '@/lib/format';
import { useI18n } from '@/i18n/useI18n';
import s from './WeatherForecast.module.css';

/** ชื่อวันแบบสั้นตามภาษา — ใช้ Intl แทนการเพิ่มคีย์ 7 วัน (localize เองอัตโนมัติ) */
function dayShort(iso: string, lang: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-US', { weekday: 'short' }).format(
    date,
  );
}

/**
 * พยากรณ์อากาศจริงของฟาร์ม — การ์ดใหญ่บนสุดของแดชบอร์ด
 *
 * ดึงจาก Open-Meteo (เวลาไทย) · ดึงไม่ได้ = ไม่แสดงการ์ด (ไม่ค้างที่ค่าปลอม)
 * แถบหัวมีนาฬิกาไทยจริง (เดินทุก 10 วิ) คู่กับสภาพอากาศ — คนดูเห็นเวลากับอากาศพร้อมกัน
 * ค่าเดียวกันนี้ยังไปขับกลางคืน/ฝนในฉากเกมด้วย — คนดูจึงเห็นสอดคล้องกันทั้งแอป
 */
export function WeatherForecast() {
  const { t, lang } = useI18n();
  const weather = useWeather();
  const now = useClock();

  // ยังดึงไม่ได้/ยังไม่มา → ไม่แสดง (ดีกว่าค้างค่าปลอมบนหัวหน้า)
  if (weather === null) return null;

  const look = weatherLook(weather.code);

  return (
    <section
      className={[s.card, weather.isDay ? s.day : s.night].join(' ')}
      aria-label={t.wxForecastTitle}
    >
      <span className={s.sheen} aria-hidden="true" />
      <div className={s.head}>
        <span className={s.headTitle}>
          <Icon name={weather.isDay ? 'wxSun' : 'clock'} size={18} color="#fff" strokeWidth={2} />
          {t.wxForecastTitle}
        </span>
        <span className={s.clock}>
          <Icon name="clock" size={16} color="#fff" strokeWidth={2} />
          <b className={s.clockTime}>{hhmmBangkok(now)}</b>
          <span className={s.clockDate}>{dateShortBangkok(now, lang)}</span>
        </span>
      </div>

      <div className={s.body}>
        <div className={s.now}>
          <span className={s.nowIcon} aria-hidden="true">
            <Icon name={look.icon} size={40} color="#fff" strokeWidth={1.7} />
          </span>
          <div className={s.nowText}>
            <div className={s.nowTempRow}>
              <span className={s.nowTemp}>{Math.round(weather.tempC)}°</span>
              <div className={s.nowMeta}>
                <div className={s.nowCond}>{t[look.labelKey]}</div>
                <div className={s.nowSub}>
                  {t.wxForecastSub} · {t.senHum} {Math.round(weather.humidity)}%
                </div>
              </div>
            </div>
            {weather.isRaining ? (
              <span className={s.rainNow}>
                <Icon name="wxRain" size={14} color="#fff" strokeWidth={2.2} />
                {t.wxRainNow}
              </span>
            ) : null}
          </div>
        </div>

        <div className={s.days}>
          {weather.daily.map((d, i) => {
            const dl = weatherLook(d.code);
            return (
              <div key={d.date} className={s.dayCell}>
                <span className={s.dayName}>{i === 0 ? t.wxToday : dayShort(d.date, lang)}</span>
                <Icon name={dl.icon} size={24} color="#fff" strokeWidth={1.8} />
                <span className={s.dayTemps}>
                  <b>{Math.round(d.max)}°</b>
                  <span className={s.dayMin}>{Math.round(d.min)}°</span>
                </span>
                <span className={s.dayRain}>{t.wxRainChance(d.rainChance)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
