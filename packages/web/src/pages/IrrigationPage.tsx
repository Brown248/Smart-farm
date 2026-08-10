import { useCallback, useMemo, useRef, useState } from 'react';
import { EstopDefiedAlert, Toast } from '@/components/common';
import { CommandConfirm } from '@/components/common/CommandConfirm';
import { CropIcon, Icon } from '@/components/common/Icon';
import { NumberField } from '@/components/common/NumberField';
import { DataPage } from '@/components/layout/DataPage';
import { ZoneDrawer } from '@/components/irrigation/ZoneDrawer';
import type { ZoneSettings } from '@/components/irrigation/ZoneDrawer';
import {
  IRR_COLOR,
  IRR_ZONES,
  LAYER_LABEL,
  MAP_LAYERS,
  MAX_SCHEDULE_TIMES,
  MODE_COLOR,
  MODE_DESC,
  MODE_ICON,
  MODE_LABEL,
  layerColor,
  shade,
} from '@/data/irrigation';
import type {
  DrawerTab,
  HybridRules,
  IrrStatus,
  IrrZone,
  MapLayer,
  MoistureRule,
  WateringMode,
} from '@/data/irrigation';
import { useWeather } from '@/hooks/useWeather';
import { weatherLook } from '@/lib/weatherCode';
import { useConfirm } from '@/hooks/useConfirm';
import { useDeviceCommand } from '@/hooks/useDeviceCommand';
import { useElapsedSeconds } from '@/hooks/useDashboardData';
import { useToast } from '@/hooks/useToast';
import { useI18n } from '@/i18n/useI18n';
import type { Dict, TextKey } from '@/i18n/keys';
import { soilToIrrStatus } from '@/data/zoneSoil';
import { useReducedMotion } from '@/lib/reducedMotion';
import { useFarmState } from '@/state/FarmStateProvider';
import g from '@/styles/dashboard.module.css';
import s from './IrrigationPage.module.css';

const zoneNameOf = (letter: string, t: Dict): string => t.zoneLetterPrefix + letter;

const STATUS_LABEL: Readonly<Record<IrrStatus, TextKey>> = {
  watering: 'lgWatering',
  normal: 'lgNormal',
  warn: 'lgWatch',
  dry: 'lgDry',
};

function defaultSettings(z: IrrZone, t: Dict): ZoneSettings {
  return {
    name: zoneNameOf(z.letter, t),
    crop: t[z.cropKey],
    area: t.areaUnit(z.area),
    target: '40%',
  };
}

export function IrrigationPage() {
  const { t, lang } = useI18n();
  const { toast, flash } = useToast();
  const reduced = useReducedMotion();
  const confirm = useConfirm();

  /** ใช้วางการ์ด hover ให้ตรงตำแหน่งเมาส์บนแผนที่ */
  const mapRef = useRef<HTMLDivElement>(null);

  const [layer, setLayer] = useState<MapLayer>('status');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverXY, setHoverXY] = useState<{ x: number; y: number } | null>(null);

  const [drawerLetter, setDrawerLetter] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('overview');

  /**
   * หยุดฉุกเฉินกับสถานะรดน้ำเป็นของทั้งฟาร์ม — กดที่หน้านี้ต้องมีผลกับทุกหน้า
   * `watering` อ่านจากปั๊ม เพราะไม่มีวาล์วแยกแปลง เปิดปั๊มทีเดียวน้ำไปครบ 8 แปลง
   * ค่าตั้งรดน้ำ (`wateringConfig`) เก็บใน provider → อยู่รอดข้ามหน้า (ยังไม่ actuate — ป้าย not-live)
   */
  const {
    estop: emergency,
    watering,
    devices,
    climate,
    zones,
    live,
    notifPrefs,
    toggleNotif,
    wateringConfig,
    updateWatering,
    zoneSettings,
    setZoneSettings,
  } = useFarmState();
  // แยกค่าตั้งออกมาให้อ่านง่าย · `strategy` (รวม 'manual') ใช้กับลิ้นชัก/การ์ด hover
  const { autoOn, mode, hybrid: rules, schedule, moisture } = wateringConfig;
  const strategy: WateringMode = autoOn ? mode : 'manual';
  // helper ให้ตัวแก้กติกาเขียนกลับเข้า provider (คงหน้าตา JSX เดิม)
  const setRules = (next: HybridRules) => updateWatering({ hybrid: next });
  const setSchedule = (fn: (prev: readonly string[]) => readonly string[]) =>
    updateWatering({ schedule: fn(schedule) });
  const setMoisture = (fn: (prev: MoistureRule) => MoistureRule) =>
    updateWatering({ moisture: fn(moisture) });
  // อากาศจริงของฟาร์ม (Open-Meteo) — ดึงไม่ได้ = แสดง empty state (ไม่โชว์ตัวเลขปลอม)
  const weather = useWeather();
  const command = useDeviceCommand({ t, temp: climate.temp, confirm, flash });
  /** ป้าย "อัปเดต … ที่แล้ว" รีเซ็ตตามค่าจริงล่าสุด (โชว์เฉพาะตอน live) */
  const secs = useElapsedSeconds(live.updatedAt);

  /**
   * ความชื้นดินจริงทับค่าที่ฝังใน `IRR_ZONES` — **อ่านจาก provider แหล่งเดียว**
   *
   * เดิมแผนที่นี้อ่าน `IRR_ZONES[].moisture` ที่ฝังไว้ (48/24/34…) ค่าจริงจึงไปไม่ถึง
   * เซนเซอร์ดินมีตัวเดียวทั้งฟาร์ม → ทุกแปลงได้ค่าเดียวกัน และสถานะมาจากค่านั้น
   * ยังไม่ต่อจริง (`live.fields` ไม่มี soil) ก็ใช้ค่า mock เดิมของ `IRR_ZONES` ต่อ (fallback)
   */
  const zonesToShow = useMemo(() => {
    if (!live.fields.has('soil')) return IRR_ZONES;
    const soilById = new Map(zones.map((z) => [z.id, z.soil]));
    return IRR_ZONES.map((z) => {
      const soil = soilById.get(z.zoneId);
      if (soil === undefined) return z;
      return { ...z, moisture: Math.round(soil), status: soilToIrrStatus(soil) };
    });
  }, [live.fields, zones]);

  /*
   * ข้อมูลแปลงอยู่ใน provider (ของทั้งฟาร์ม) — เดิมเป็น state ของหน้านี้ กดบันทึกแล้วขึ้นว่า
   * "บันทึกเรียบร้อย" แต่พอไปหน้าอื่นแล้วกลับมาก็หายหมด = แอปโกหกผู้ใช้
   * `settingsSaved` ยังเป็นของหน้านี้ได้ เพราะเป็นแค่ feedback ชั่วคราวบนลิ้นชักที่เปิดอยู่
   */
  const [settingsSaved, setSettingsSaved] = useState(false);

  /** ชื่อที่แสดง = ชื่อที่ผู้ใช้ตั้งไว้ในแท็บ "ตั้งค่า" (บันทึกแล้ว) ถ้ามี ไม่งั้น "โซน X" */
  const displayName = (letter: string): string =>
    zoneSettings[letter]?.name?.trim() || zoneNameOf(letter, t);

  const drawerZone = drawerLetter
    ? (zonesToShow.find((z) => z.letter === drawerLetter) ?? null)
    : null;

  /**
   * "ต้องดูแลด่วน" = แปลงที่สถานะดินเป็น warn/dry จริง ณ ตอนนี้ (จาก `zonesToShow`)
   * เดิมฝัง "โซน B เซนเซอร์ค้าง / โซน G 35%" ไว้ตายตัว ซึ่งขัดกับค่าจริง —
   * เซนเซอร์ดินมีตัวเดียวทั้งฟาร์ม จะเจาะจงว่าแปลงไหนค้าง/ต่ำแยกกันไม่ได้
   */
  const attention = zonesToShow
    .filter((z) => z.status === 'dry' || z.status === 'warn')
    .map((z) => ({
      letter: z.letter,
      name: displayName(z.letter),
      crop: t[z.cropKey],
      moisture: z.moisture,
      dry: z.status === 'dry',
    }));

  /**
   * ทุกแปลงใช้ปั๊มตัวเดียวกัน — ปั๊มออฟไลน์ = สั่งรดน้ำไม่ได้ทั้งฟาร์ม
   * (guard G1 เรื่องระดับน้ำถูกถอดออก — ถังเป็น mock · ใช้ยืนยันเช็คน้ำ + auto-cutoff แทน
   *  ปุ่มจึงไม่ปิดตามถังอีก คงปิดเฉพาะออฟไลน์/หยุดฉุกเฉิน/กำลังส่งคำสั่ง)
   */
  const pump = devices.find((d) => d.id === 'pump');
  const offline = !(pump?.online ?? true);
  const pumpPending = pump?.pending != null;

  const openZone = useCallback((letter: string, tab: DrawerTab = 'overview') => {
    // เช็กแค่ว่าตัวอักษรโซนมีจริง — ใช้ `IRR_ZONES` (คงที่) ไม่ใช่ `zonesToShow` ที่เปลี่ยนตามค่าจริง
    // ตัวอักษร A–H เท่าเดิมเสมอ overlay เปลี่ยนแค่ความชื้น/สถานะ ลิ้นชักหาโซนเองจาก `drawerLetter`
    if (!IRR_ZONES.some((x) => x.letter === letter)) return;
    setDrawerLetter(letter);
    setDrawerTab(tab);
    // ห้ามล้างหยุดฉุกเฉินตรงนี้ — มันเป็นสถานะของทั้งฟาร์ม ไม่ใช่ของลิ้นชักที่เพิ่งเปิด
    // (ของเดิมเก็บ emergency ไว้ในหน้านี้เอง เลยรีเซ็ตทิ้งได้โดยไม่มีใครรู้)
    setSettingsSaved(false);
  }, []);

  const hoverZone = hoverId ? (zonesToShow.find((z) => z.letter === hoverId) ?? null) : null;

  const drawerSettings = drawerZone
    ? (zoneSettings[drawerZone.letter] ?? defaultSettings(drawerZone, t))
    : null;

  return (
    <>
      <DataPage
        title={t.irrTitle}
        subtitle={t.farmName}
        secondsSinceRead={secs}
        onSoon={() => flash(t.soonToast)}
        onFlash={flash}
      >
        {/* กดหยุดฉุกเฉินแล้วอุปกรณ์ยังไม่หยุด — ต้องเห็นทุกหน้าที่แสดงสถานะ estop ไม่ใช่แค่หน้าโรงเรือน */}
        <EstopDefiedAlert className={g.section} />

        {/* ── อากาศจริง (Open-Meteo) + หมายเหตุเรื่องฝน · ดึงไม่ได้ = empty state ── */}
        {weather ? (
          <div className={`${g.glass} ${s.wx}`}>
            <div className={s.wxNow}>
              <span className={s.wxIcon} aria-hidden="true">
                <Icon
                  name={weatherLook(weather.code).icon}
                  size={26}
                  color="var(--d-m-hum)"
                  strokeWidth={1.6}
                />
              </span>
              <div style={{ lineHeight: 1.1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span className={`${s.wxTemp} ${g.num}`}>{Math.round(weather.tempC)}°C</span>
                  <span className={s.wxCond}>{t[weatherLook(weather.code).labelKey]}</span>
                </div>
                <div className={s.wxRain}>
                  {t.senHum} {Math.round(weather.humidity)}%
                  {weather.isRaining ? ` · ${t.wxRainNow}` : ''}
                </div>
              </div>
            </div>
            <div className={s.wxDivider} aria-hidden="true" />
            <div className={s.advisory}>
              <span className={s.advIcon} aria-hidden="true">
                <Icon name="soil" size={18} color="#26746f" strokeWidth={1.8} />
              </span>
              <div style={{ lineHeight: 1.35 }}>
                <div className={s.advTitle}>{t.advTitle}</div>
                <div className={s.advBody}>{t.advBody}</div>
              </div>
            </div>
            <span className={s.advBadge}>
              <Icon name="bulb" size={14} strokeWidth={2.1} />
              {t.advBadge}
            </span>
            <div className={`${s.forecastRow} ${g.hscroll}`}>
              {weather.daily.map((day) => {
                const look = weatherLook(day.code);
                const wd = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-US', {
                  weekday: 'short',
                }).format(new Date(day.date));
                return (
                  <div key={day.date} className={s.forecastCell}>
                    <span className={s.forecastTime}>{wd}</span>
                    <Icon name={look.icon} size={20} color="var(--d-m-hum)" />
                    <span className={`${s.forecastTemp} ${g.num}`}>{Math.round(day.max)}°</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={`${g.glass} ${s.wx}`}>
            <div className={s.wxEmpty}>
              <Icon name="wxCloud" size={22} color="var(--d-muted)" strokeWidth={1.7} />
              <span>{t.wxUnavailable}</span>
            </div>
          </div>
        )}

        {/* ── แผนที่ฟาร์ม ── */}
        <section className={`${g.glass} ${g.section}`} aria-label={t.mapTitle}>
          <div className={s.mapHead}>
            <div>
              <h2 className={g.h2}>{t.mapTitle}</h2>
              <p className={g.sub} style={{ margin: '3px 0 0' }}>
                {t.mapHint}
              </p>
            </div>
            <div className={s.mapLegend}>
              {(['watering', 'normal', 'warn', 'dry'] as const).map((k) => (
                <span key={k} className={s.legendItem}>
                  <span className={s.legendSwatch} style={{ background: IRR_COLOR[k] }} />
                  {t[STATUS_LABEL[k]]}
                </span>
              ))}
            </div>
          </div>

          <div className={`${s.layerRow} ${g.hscroll}`}>
            <span className={g.sub} style={{ flex: 'none' }}>
              {t.layerLabel}
            </span>
            {MAP_LAYERS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={layer === l}
                className={[s.layerBtn, layer === l ? s.layerBtnOn : null]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setLayer(l)}
              >
                {t[LAYER_LABEL[l]]}
              </button>
            ))}
          </div>

          <div ref={mapRef} className={s.mapWrap}>
            <div className={s.sunStrip} aria-hidden="true">
              <Icon name="wxSun" size={14} color="#8a6a12" strokeWidth={1.9} />
              {t.mapSun}
            </div>

            <div className={s.plot}>
              <div className={s.plotFrame} aria-hidden="true" />
              <div className={s.doorTag}>
                <Icon name="door" size={12} color="var(--d-ink-4)" strokeWidth={2} />
                {t.mapDoor}
              </div>

              {zonesToShow.map((z, zi) => {
                const col = layerColor(z, watering, layer);
                const closed = z.closed === true;
                // ระหว่างรดน้ำไม่ต้องเตือนว่าแห้ง เพราะกำลังแก้อยู่แล้ว
                const alert =
                  layer === 'status' && !watering && (z.status === 'warn' || z.status === 'dry');
                const dotStatus: IrrStatus = watering ? 'watering' : z.status;
                const ink = closed ? '#f2f7f3' : '#12211a';
                const subInk = closed ? 'rgba(240,247,242,.88)' : 'rgba(18,33,26,.72)';
                const bg = closed
                  ? `linear-gradient(160deg,${shade(col, 0.55)},${shade(col, 0.36)})`
                  : `linear-gradient(160deg,${shade(col, 1.42)} 0%,${shade(col, 1.22)} 55%,${shade(col, 1.05)} 100%)`;
                const name = displayName(z.letter);

                return (
                  <div
                    key={z.letter}
                    data-zone={z.letter}
                    className={s.bed}
                    style={{
                      left: z.x + '%',
                      top: z.y + '%',
                      width: z.w + '%',
                      height: z.h + '%',
                      background: bg,
                      border: `${closed ? 2 : 1.5}px solid ${shade(col, closed ? 0.7 : 0.85)}`,
                      boxShadow: `${closed ? '' : 'inset 0 1px 0 rgba(255,255,255,.78),'}0 12px 20px -10px ${shade(col, 0.55)},0 5px 8px -4px rgba(28,60,40,.42)`,
                      animationDelay: (zi * 0.05).toFixed(2) + 's',
                    }}
                    onMouseEnter={() => setHoverId(z.letter)}
                    onMouseMove={(e) => {
                      const el = mapRef.current;
                      if (!el) return;
                      const r = el.getBoundingClientRect();
                      setHoverXY({ x: e.clientX - r.left, y: e.clientY - r.top });
                    }}
                    onMouseLeave={() => {
                      setHoverId((cur) => (cur === z.letter ? null : cur));
                      setHoverXY(null);
                    }}
                  >
                    {watering && !reduced ? (
                      <>
                        <span className={s.waterSheen} aria-hidden="true" />
                        <span className={s.waterWave} aria-hidden="true" />
                      </>
                    ) : null}
                    {closed ? <span className={s.closedHatch} aria-hidden="true" /> : null}
                    {alert && !reduced ? (
                      <span
                        className={s.alertRing}
                        aria-hidden="true"
                        style={{
                          border: `3px solid ${IRR_COLOR[z.status]}`,
                          boxShadow: `0 0 15px ${IRR_COLOR[z.status]}`,
                        }}
                      />
                    ) : null}

                    <span className={s.bedTop}>
                      <span
                        className={s.bedCropWrap}
                        style={{
                          background: closed ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.72)',
                          border: `1px solid ${closed ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.9)'}`,
                        }}
                      >
                        <CropIcon name={z.cropIcon} size={20} color={closed ? '#eaf3ee' : ink} />
                      </span>
                      {/* ปุ่มหลักของแปลง — เปิดลิ้นชักข้อมูล */}
                      <button
                        type="button"
                        className={s.bedName}
                        aria-label={`${name} · ${t[z.cropKey]} · ${z.moisture}% · ${t[STATUS_LABEL[dotStatus]]}`}
                        style={{
                          color: ink,
                          border: 0,
                          background: 'transparent',
                          padding: 0,
                          cursor: 'pointer',
                          font: 'inherit',
                          fontWeight: 700,
                        }}
                        onClick={() => openZone(z.letter)}
                      >
                        {name}
                      </button>
                      <span
                        className={s.bedDot}
                        aria-hidden="true"
                        style={{ background: IRR_COLOR[dotStatus] }}
                      />
                      <button
                        type="button"
                        className={s.sensorChip}
                        aria-label={`${name} · ${t.mapSensor}`}
                        style={{
                          background: closed ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.62)',
                          color: closed ? '#eaf3ee' : '#2c3a32',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openZone(z.letter, 'sensors');
                        }}
                      >
                        <Icon name="chip" size={11} strokeWidth={2.4} />
                      </button>
                    </span>

                    <span className={s.bedCrop} style={{ color: subInk }}>
                      {t[z.cropKey]}
                    </span>

                    {/* ไม่มีป้ายโหมดรายแปลงแล้ว — โหมดรดน้ำเป็นค่าเดียวของทั้งฟาร์ม */}
                    <span className={s.bedFoot}>
                      <span className={`${s.bedMoist} ${g.num}`} style={{ color: ink }}>
                        {z.moisture}%
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            {hoverZone ? (
              <div
                className={`${g.glass} ${s.hoverCard}`}
                aria-hidden="true"
                style={
                  hoverXY ? { left: hoverXY.x + 14, top: hoverXY.y + 14 } : { left: 15, top: 34 }
                }
              >
                <div className={s.hoverTitle}>
                  {displayName(hoverZone.letter)} · {t[hoverZone.cropKey]}
                </div>
                <div className={s.hoverStats}>
                  <div className={s.hoverStat}>
                    <span className={`${s.hoverValue} ${g.num}`}>{hoverZone.moisture}%</span>
                    <div className={s.hoverLabel}>{t.hMoist}</div>
                  </div>
                  <div className={s.hoverStat}>
                    {/* อุณหภูมิมีเซนเซอร์ตัวเดียวทั้งฟาร์ม — โชว์ค่าเดียวกันทุกแปลง ไม่ใช่เลขปลอมรายโซน */}
                    <span className={`${s.hoverValue} ${g.num}`}>{Math.round(climate.temp)}°C</span>
                    <div className={s.hoverLabel}>{t.hTemp}</div>
                  </div>
                  <div className={s.hoverStat}>
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: watering ? 'var(--d-m-hum)' : 'var(--d-muted)',
                      }}
                    >
                      {watering ? t.watering : t.idle}
                    </span>
                    <div className={s.hoverLabel}>{t.hWater}</div>
                  </div>
                </div>
                <div className={s.hoverFoot}>
                  <div>
                    {/* โหมดเป็นของทั้งฟาร์ม — ทุกแปลงใช้ค่าเดียวกันเพราะใช้ปั๊มร่วมกัน */}
                    <div className={s.hoverLabel}>{t.hMode}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--d-ink-2)' }}>
                      {t[MODE_LABEL[strategy]]}
                    </div>
                  </div>
                  <div>
                    {/* ทุกโซนใช้ปั๊มตัวเดียวกัน จึงบอกสถานะปั๊ม ไม่ใช่ตัวควบคุมรายโซนที่ไม่มีจริง */}
                    <div className={s.hoverLabel}>{t.infraPump}</div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: offline ? '#d16a52' : 'var(--d-ok)',
                      }}
                    >
                      {offline ? t.ctrlOffline : t.ctrlOnline}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/*
          สองส่วนนี้สั้นทั้งคู่ ถ้าเรียงลงมาทีละอันจะเหลือที่ว่างข้างขวาเป็นแถบยาว
          วางคู่กันแทน — และเป็นคู่ที่ควรอ่านพร้อมกันอยู่แล้ว: "แปลงไหนมีปัญหา" กับ "ปุ่มรดน้ำ"
        */}
        <div className={s.dualRow}>
          {/* ── รดน้ำทั้งโรงเรือน — ปุ่มเดียวของทั้งฟาร์ม ── */}
          <section className={`${g.glass} ${g.section}`} aria-label={t.waterAllTitle}>
            <div>
              <h2 className={g.h2}>{t.waterAllTitle}</h2>
              <p className={g.sub} style={{ margin: '3px 0 0' }}>
                {t.waterAllHint}
              </p>
            </div>

            {offline ? (
              <div className={s.blockMsg} role="alert">
                <Icon name="alert" size={18} color="#9a5e0c" strokeWidth={2} />
                <span>{t.ctrlOfflineMsg}</span>
              </div>
            ) : null}

            {/* ปุ่มไม่ยืดเต็มความกว้าง 1,088px ของคอลัมน์ — จับคู่กับสถานะไว้ข้างๆ แทน */}
            <div className={s.waterRow}>
              <button
                type="button"
                disabled={offline || pumpPending || emergency}
                className={[s.ctrlBtn, s.waterBtn, watering ? s.startRunning : s.startIdle].join(
                  ' ',
                )}
                onClick={command.waterAll}
              >
                {pumpPending ? <span className={s.btnSpin} aria-hidden="true" /> : null}
                <Icon name={watering ? 'stop' : 'drop'} size={18} strokeWidth={2} />
                {pumpPending
                  ? watering
                    ? t.ctStopping
                    : t.ctStarting
                  : watering
                    ? t.ctStop
                    : t.ctStart}
              </button>

              <div className={s.waterFacts}>
                {/* แยก "ส่งคำสั่งแล้ว" ออกจาก "อุปกรณ์ยืนยันแล้ว" */}
                <div className={s.confirmState}>
                  <span
                    className={s.confirmDot}
                    aria-hidden="true"
                    style={{
                      background: pumpPending
                        ? 'var(--d-warn)'
                        : watering
                          ? 'var(--d-ok)'
                          : '#8b9a92',
                    }}
                  />
                  {pumpPending
                    ? t.stateSending
                    : watering
                      ? t.stateConfirmedOn
                      : t.stateConfirmedOff}
                </div>

                {/*
                  เหลือแค่สถานะปั๊ม (เชื่อมต่อได้ไหม) — บอกว่าสั่งรดน้ำได้หรือไม่
                  ระดับถัง/แรงดัน/ปริมาณน้ำ ถอดออกหมดแล้ว เพราะยังไม่มีเซนเซอร์จริง (เจ้าของงานสั่ง)
                */}
                <div className={s.factRow}>
                  <span className={s.fact}>
                    <Icon name="pump" size={15} color="var(--d-m-hum)" strokeWidth={1.8} />
                    {t.infraPump}
                    <b
                      className={s.factValue}
                      style={{ color: offline ? '#d16a52' : 'var(--d-ok-ink)' }}
                    >
                      {offline ? t.ctrlOffline : t.ctrlOnline}
                    </b>
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ── ต้องดูแลด่วน — คำนวณจากสถานะดินจริง ไม่ใช่รายการฝังตายตัว ── */}
          <section className={`${g.glass} ${g.lift} ${g.section}`} aria-label={t.attnTitle}>
            <h2 className={g.h2}>{t.attnTitle}</h2>
            <div className={s.attnList}>
              {attention.length === 0 ? (
                <div className={s.attnEmpty}>{t.attnAllOk}</div>
              ) : (
                attention.map((a) => {
                  const color = a.dry ? '#d16a52' : 'var(--d-warn)';
                  return (
                    <button
                      key={a.letter}
                      type="button"
                      className={s.attnCard}
                      onClick={() => openZone(a.letter)}
                    >
                      <span
                        className={s.attnDot}
                        aria-hidden="true"
                        style={{ background: color, boxShadow: `0 0 0 3px ${color}22` }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className={s.attnTitle}>
                          {a.name} · {a.crop}
                        </div>
                        <div className={s.attnSub}>
                          {a.dry ? t.attnDry : t.attnLow} · {a.moisture}%
                        </div>
                      </div>
                      <Icon name="chevronRight" size={16} color="#79867e" strokeWidth={2} />
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* ── อัตโนมัติ (ของทั้งฟาร์ม) ── */}
        <section className={`${g.glass} ${g.section}`} aria-label={t.auStrategy}>
          <div className={s.autoHead}>
            <div>
              <h2 className={g.h2}>{t.auStrategy}</h2>
              <p className={g.sub} style={{ margin: '3px 0 0' }}>
                {t.auFarmWideHint}
              </p>
            </div>
            {/* กติกาพวกนี้ยังไม่มีตัวสั่งงานอ่านไปใช้ — ต้องบอกให้ชัด ไม่ใช่ปล่อยให้เข้าใจว่าทำงานแล้ว */}
            <div className={s.notLiveNote} role="note">
              <Icon name="info" size={15} color="var(--d-muted)" strokeWidth={1.9} />
              <span>{t.rulesNotLiveNote}</span>
            </div>
          </div>

          <div className={s.ctlStack}>
            {/* สวิตช์หลัก: รดน้ำอัตโนมัติ เปิด/ปิด (ปิด = สั่งเองด้วยปุ่มรดน้ำ · ไม่มีโหมด "มือ" แยก) */}
            <div className={s.autoMaster}>
              <div className={s.autoMasterText}>
                <b className={s.autoMasterTitle}>{t.auAutoTitle}</b>
                <span className={s.autoMasterSub}>{autoOn ? t.auAutoOnSub : t.auAutoOffSub}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoOn}
                aria-label={t.auAutoTitle}
                className={[s.masterSwitch, autoOn ? s.masterSwitchOn : null]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => updateWatering({ autoOn: !autoOn })}
              >
                <span
                  className={[s.masterKnob, autoOn ? s.masterKnobOn : null]
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden="true"
                />
              </button>
            </div>

            {autoOn ? (
              <div className={s.stratGrid}>
                {(['schedule', 'moisture', 'hybrid'] as const).map((k) => {
                  const on = mode === k;
                  const color = MODE_COLOR[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      className={[s.stratBtn, on ? s.stratBtnOn : null].filter(Boolean).join(' ')}
                      style={
                        on
                          ? {
                              borderColor: color,
                              background: `color-mix(in srgb, ${color} 8%, var(--d-surface))`,
                            }
                          : undefined
                      }
                      onClick={() => updateWatering({ mode: k })}
                    >
                      <span
                        className={s.stratIcon}
                        aria-hidden="true"
                        style={{ background: `color-mix(in srgb, ${color} 16%, transparent)` }}
                      >
                        <Icon name={MODE_ICON[k]} size={17} color={color} strokeWidth={1.9} />
                      </span>
                      <span className={s.stratText}>
                        <b className={s.stratLabel}>{t[MODE_LABEL[k]]}</b>
                        <span className={s.stratDesc}>{t[MODE_DESC[k]]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {autoOn && mode === 'hybrid' ? (
              /* จอกว้างวางสองการ์ดคู่กัน — "รดน้ำเมื่อ" กับ "ข้ามเมื่อ" อ่านเทียบกันง่ายกว่าเรียงลง */
              <div className={s.ruleGrid}>
                {/* รดน้ำเมื่อ — ทุกเงื่อนไขต้องจริง (AND) */}
                <div className={s.ctlCard}>
                  <div className={s.ruleGroupHead}>
                    <span className={s.ruleGroupIcon} style={{ background: 'var(--d-ok-bg)' }}>
                      <Icon name="tick" size={15} color="var(--brand-green)" strokeWidth={2} />
                    </span>
                    <span className={s.ruleGroupTitle} style={{ color: 'var(--d-ok-ink)' }}>
                      {t.auRunTitle}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className={`${s.ruleRow} ${s.ruleRowRun}`}>
                      <Icon name="clock" size={16} color="var(--brand-green)" strokeWidth={1.8} />
                      <label className={s.ruleName} htmlFor="rule-from">
                        {t.auTimePre}
                      </label>
                      <input
                        id="rule-from"
                        type="time"
                        className={`${s.ruleInput} ${s.ruleTime}`}
                        aria-label={t.auTimeFromAria}
                        value={rules.timeFrom}
                        onChange={(e) => setRules({ ...rules, timeFrom: e.target.value })}
                      />
                      <span className={s.timeSep}>–</span>
                      <input
                        type="time"
                        className={`${s.ruleInput} ${s.ruleTime}`}
                        aria-label={t.auTimeToAria}
                        value={rules.timeTo}
                        onChange={(e) => setRules({ ...rules, timeTo: e.target.value })}
                      />
                    </div>
                    <div className={s.opRow}>
                      <span className={s.opAnd}>AND</span>
                    </div>
                    <div className={`${s.ruleRow} ${s.ruleRowRun}`}>
                      <Icon name="soil" size={16} color="var(--brand-green)" strokeWidth={1.8} />
                      <label className={s.ruleName} htmlFor="rule-low">
                        {t.auMoistLowPre}
                      </label>
                      <NumberField
                        id="rule-low"
                        className={`${s.ruleInput} ${s.ruleNum}`}
                        min={0}
                        max={100}
                        value={rules.moistLow}
                        onCommit={(v) => setRules({ ...rules, moistLow: v })}
                      />
                      <span style={{ color: 'var(--d-muted)' }}>%</span>
                    </div>
                  </div>
                </div>

                {/* ข้ามการรดน้ำเมื่อ — เงื่อนไขใดจริงก็ข้าม (OR) */}
                <div className={s.ctlCard}>
                  <div className={s.ruleGroupHead}>
                    <span className={s.ruleGroupIcon} style={{ background: 'var(--d-warn-bg)' }}>
                      <Icon name="close" size={15} color="var(--d-warn)" strokeWidth={2} />
                    </span>
                    <span className={s.ruleGroupTitle} style={{ color: 'var(--d-warn-ink-2)' }}>
                      {t.auSkipTitle}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className={`${s.ruleRow} ${s.ruleRowSkip}`}>
                      <Icon name="soil" size={16} color="var(--d-warn)" strokeWidth={1.8} />
                      <label className={s.ruleName} htmlFor="rule-high">
                        {t.auMoistHighPre}
                      </label>
                      <NumberField
                        id="rule-high"
                        className={`${s.ruleInput} ${s.ruleNum}`}
                        min={0}
                        max={100}
                        value={rules.moistHigh}
                        onCommit={(v) => setRules({ ...rules, moistHigh: v })}
                      />
                      <span style={{ color: 'var(--d-muted)' }}>%</span>
                    </div>
                    <div className={s.opRow}>
                      <span className={s.opOr}>OR</span>
                    </div>
                    <div className={`${s.ruleRow} ${s.ruleRowSkip}`}>
                      <Icon name="wxRain" size={16} color="var(--d-warn)" strokeWidth={1.8} />
                      <label className={s.ruleName} htmlFor="rule-rain">
                        {t.auRainPre}
                      </label>
                      <NumberField
                        id="rule-rain"
                        className={`${s.ruleInput} ${s.ruleNum}`}
                        min={0}
                        max={100}
                        value={rules.rain}
                        onCommit={(v) => setRules({ ...rules, rain: v })}
                      />
                      <span style={{ color: 'var(--d-muted)' }}>%</span>
                    </div>
                  </div>
                </div>

                <div className={s.hybridNote}>
                  <Icon name="info" size={14} color="var(--d-muted)" strokeWidth={1.9} />
                  <span>{t.auHybridNote}</span>
                </div>
              </div>
            ) : null}

            {autoOn && mode === 'schedule' ? (
              <div className={s.ctlCard}>
                <div className={s.ctlLabel}>{t.auSchedTitle}</div>
                <div className={s.ctlHint}>
                  <Icon name="info" size={14} color="var(--d-muted)" strokeWidth={1.9} />
                  <span>{t.auSchedHint}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  {schedule.map((time, i) => (
                    <div key={i} className={`${s.ruleRow} ${s.ruleRowRun}`}>
                      <Icon name="clock" size={16} color="var(--d-warn)" strokeWidth={1.8} />
                      <span className={s.ruleName}>{t.auSchedAt}</span>
                      <input
                        type="time"
                        className={`${s.ruleInput} ${s.ruleTime}`}
                        aria-label={`${t.auSchedAt} ${i + 1}`}
                        value={time}
                        onChange={(e) =>
                          setSchedule((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                        }
                      />
                      {schedule.length > 1 ? (
                        <button
                          type="button"
                          className={s.schedRemoveBtn}
                          aria-label={t.auSchedRemove}
                          onClick={() => setSchedule((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <Icon name="close" size={15} strokeWidth={2.2} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {schedule.length < MAX_SCHEDULE_TIMES ? (
                    <button
                      type="button"
                      className={s.schedAddBtn}
                      onClick={() => setSchedule((prev) => [...prev, '12:00'])}
                    >
                      <Icon name="plus" size={14} strokeWidth={2.2} />
                      {t.auSchedAdd}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {autoOn && mode === 'moisture' ? (
              <div className={s.ctlCard}>
                <div className={s.ctlLabel}>{t[MODE_LABEL.moisture]}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  <div className={`${s.ruleRow} ${s.ruleRowRun}`}>
                    <Icon name="soil" size={16} color="var(--d-m-hum)" strokeWidth={1.8} />
                    <label className={s.ruleName} htmlFor="moist-low">
                      {t.auMoistBelow}
                    </label>
                    <NumberField
                      id="moist-low"
                      className={`${s.ruleInput} ${s.ruleNum}`}
                      min={0}
                      max={100}
                      value={moisture.low}
                      onCommit={(v) => setMoisture((m) => ({ ...m, low: v }))}
                    />
                    <span style={{ color: 'var(--d-muted)' }}>%</span>
                  </div>
                  <div className={`${s.ruleRow} ${s.ruleRowSkip}`}>
                    <Icon name="soil" size={16} color="var(--d-warn)" strokeWidth={1.8} />
                    <label className={s.ruleName} htmlFor="moist-high">
                      {t.auMoistAbove}
                    </label>
                    <NumberField
                      id="moist-high"
                      className={`${s.ruleInput} ${s.ruleNum}`}
                      min={0}
                      max={100}
                      value={moisture.high}
                      onCommit={(v) => setMoisture((m) => ({ ...m, high: v }))}
                    />
                    <span style={{ color: 'var(--d-muted)' }}>%</span>
                  </div>
                </div>
              </div>
            ) : null}

            {!autoOn ? (
              <div className={s.ctlCard}>
                <div className={s.ctlLabel}>{t.auManualTitle}</div>
                <div className={s.ctlHint}>
                  <Icon name="drop" size={14} color="var(--d-muted)" strokeWidth={1.9} />
                  <span>{t.auManualHint}</span>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </DataPage>

      {/* ── ลิ้นชักข้อมูลรายแปลง — ไม่มีคำสั่งอยู่ในนี้แล้ว ── */}
      {drawerZone && drawerSettings ? (
        <ZoneDrawer
          // key ตามตัวอักษรโซน → เปลี่ยนโซนแล้ว draft ในลิ้นชักรีเซ็ตสะอาด
          key={drawerZone.letter}
          zone={drawerZone}
          tab={drawerTab}
          onTab={setDrawerTab}
          onClose={() => setDrawerLetter(null)}
          watering={watering}
          strategy={strategy}
          cmdLog={command.log}
          settings={drawerSettings}
          notif={notifPrefs}
          onNotif={toggleNotif}
          settingsSaved={settingsSaved}
          onSaveSettings={(next) => {
            // กด "บันทึก" ค่อย commit เข้า provider → ชื่อที่ตั้งอยู่รอดข้ามหน้าจริง
            setZoneSettings(drawerZone.letter, next);
            setSettingsSaved(true);
          }}
        />
      ) : null}

      {/* ── กล่องยืนยันคำสั่ง — ใช้คิวเดียวกับ useDeviceCommand จึงคุมทุกคำสั่งของหน้านี้ ── */}
      <CommandConfirm
        request={confirm.request}
        onCancel={confirm.cancel}
        onAccept={confirm.accept}
      />

      <Toast message={toast} />
    </>
  );
}
