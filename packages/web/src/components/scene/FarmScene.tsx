import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/routePaths';
import type { SceneZone, ZoneId, ZoneReading } from '@shared/zone';
import { ConfirmDialog, EstopDefiedAlert, Toast } from '@/components/common';
import { StaleBanner } from '@/components/common/StaleBanner';
import { Sidebar } from '@/components/layout/Sidebar';
import { useI18n } from '@/i18n/useI18n';
import { ZONE_LABELS } from '@/data/zones';
import { PRESENTATION_CLIMATE } from '@/data/mockClimate';
import { SceneImage, sceneSrc } from './SceneImage';
import { WeatherHud } from './WeatherHud';
import { ZonePins } from './ZonePins';
import { ZonePanel } from './ZonePanel';
import { AgentBear } from './AgentBear';
import { ControlDock } from './ControlDock';
import { AdvancedPanel } from './AdvancedPanel';
import type { AdvTab } from './AdvancedPanel';
import { RainChip } from './RainChip';
import {
  Birds,
  CloudShadows,
  DeviceEffects,
  DustMotes,
  Fireflies,
  GlassDrops,
  HeatShimmer,
  LampGlow,
  Steam,
  SunShafts,
  Vignette,
  WaterEffects,
} from './effects';
import { isNight, nextLightMode, useClock } from '@/hooks/useClock';
import type { LightMode, RainMode } from '@/hooks/useClock';
import { useWeather } from '@/hooks/useWeather';
import { useElementSize } from '@/hooks/useViewport';
import { usePointerParallax } from '@/hooks/usePointerParallax';
import { useCountUp } from '@/hooks/useCountUp';
import { usePumpCutoffToast } from '@/hooks/usePumpCutoff';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { useDeviceCommand } from '@/hooks/useDeviceCommand';
import { useFarmSim } from '@/hooks/useFarmSim';
import { useReducedMotion } from '@/lib/reducedMotion';
import { sceneRect } from '@/lib/sceneRect';
import { sceneTint } from '@/lib/sceneTint';
import { firstBadCard, hudCards } from '@/lib/status';
import { pickAgent } from '@/lib/agentPose';
import { DRIPS, FIREFLIES, MOTES } from '@/lib/particles';
import { hhmmBangkok } from '@/lib/format';
import { CLIMATE_RANGE } from '@shared/thresholds';
import s from './FarmScene.module.css';

/** โซนในโหมดนำเสนอ: ทุกโซนที่ไม่ได้รดน้ำถือว่าปกติ และดินไม่ต่ำกว่า 52% */
function presentationZones(zones: readonly SceneZone[]): readonly SceneZone[] {
  return zones.map((z) => ({
    ...z,
    status: z.status === 'watering' ? 'watering' : 'ok',
    soil: Math.max(52, z.soil),
  }));
}

export function FarmScene() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const rootRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const sceneOuterRef = useRef<HTMLDivElement>(null);

  const viewport = useElementSize(rootRef, { w: 1280, h: 800 });
  const hudSize = useElementSize(hudRef, { w: 1280, h: 132 });
  /*
   * ปิดการขยับฉากตามเมาส์ (parallax) — เจ้าของงานแจ้งว่าลากเมาส์แล้วจอขยับจนเวียนหัว
   * ฉากจะนิ่ง อนิเมชันอื่น (ฝน · อนุภาค · ตัวละคร) ยังอยู่ครบ
   * อยากเปิดกลับ เปลี่ยน `false` เป็น `!reduced`
   */
  usePointerParallax(sceneOuterRef, false);

  const now = useClock();
  const { climate, zones: rawZones } = useFarmSim();

  /** เริ่มที่ auto = ตามเวลาจริง (กลางคืนจริงในไทย → ฉากกลางคืน) เจ้าของงานสั่ง */
  const [lightMode, setLightMode] = useState<LightMode>('auto');
  /** ฝน: `null` = ตามอากาศจริง · true/false = ผู้ใช้กดสลับเอง (override) */
  const [rainOverride, setRainOverride] = useState<boolean | null>(null);
  const [presentation, setPresentation] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [advTab, setAdvTab] = useState<AdvTab>('cond');
  const [zoneId, setZoneId] = useState<ZoneId | null>(null);
  const [pressedId, setPressedId] = useState<ZoneId | null>(null);

  const { toast, flash } = useToast();
  // ปั๊มถูกตัดอัตโนมัติ = เหตุการณ์ที่ผู้ใช้ต้องรู้ทันที ไม่ใช่ไปเจอทีหลังในสมุดบันทึก
  usePumpCutoffToast(flash, t.pumpCutoffToast);
  const confirm = useConfirm();

  /*
   * กลางคืน: โหมด auto ใช้อากาศจริง (พระอาทิตย์ตกจริงที่ไทยจาก `is_day`) ถ้าดึงได้
   * ดึงไม่ได้ → ใช้เวลาเครื่อง (18:00–06:00) · โหมด day/night = ผู้ใช้บังคับเอง
   */
  const weather = useWeather();
  /*
   * กันฉาก "กระตุก" ตอนรีเฟรช: พยากรณ์โหลดแบบ async — เฟรมแรกยังไม่รู้ฝน/กลางคืน จอเลยขึ้นค่า default
   * ก่อนแล้วค่อยสลับตอนพยากรณ์มาถึง (เห็น crossfade เปลี่ยนฉาก) · ปิด transition จนกว่าจะ settle ครั้งแรก
   * → เฟรมที่สลับตามพยากรณ์ครั้งแรกจะ "สแนป" ทันที · การเปลี่ยนหลังจากนั้น (กดสลับ/อากาศเปลี่ยนจริง) ค่อย crossfade
   */
  const [sceneSettled, setSceneSettled] = useState(false);
  useEffect(() => {
    if (sceneSettled) return;
    const id = window.setTimeout(() => setSceneSettled(true), weather ? 80 : 1500);
    return () => window.clearTimeout(id);
  }, [weather, sceneSettled]);

  const night = lightMode === 'auto' && weather ? !weather.isDay : isNight(lightMode, now);
  /** ฝนตามอากาศจริง เว้นแต่ผู้ใช้กดสลับเอง (null = auto ตามจริง) */
  const rain = rainOverride ?? weather?.isRaining ?? false;
  const rainMode: RainMode = rainOverride === null ? 'auto' : rainOverride ? 'on' : 'off';
  const effectiveClimate = presentation ? PRESENTATION_CLIMATE : climate;
  const zones = presentation ? presentationZones(rawZones) : rawZones;

  const command = useDeviceCommand({
    t,
    temp: effectiveClimate.temp,
    confirm,
    flash,
  });

  // ตัวเลขบน HUD ไล่เข้าหาค่าจริง — โหมดนำเสนอใช้ค่าคงที่จึงไม่ต้องไล่
  const counted = useCountUp(climate, reduced);
  const displayed = presentation ? PRESENTATION_CLIMATE : counted;

  const cards = useMemo(() => hudCards(displayed, t), [displayed, t]);
  const climateBad = firstBadCard(cards);

  const zoneName = useCallback((id: ZoneId) => t.zonePrefix + t[ZONE_LABELS[id].name], [t]);

  const agent = useMemo(
    () =>
      pickAgent({
        estop: command.estop,
        busy: command.busy,
        presentation,
        zones,
        climateBad,
        rain,
        rh: effectiveClimate.rh,
        night,
        t,
        zoneName: (z: ZoneReading) => zoneName(z.id),
      }),
    [
      command.estop,
      command.busy,
      presentation,
      zones,
      climateBad,
      rain,
      effectiveClimate.rh,
      night,
      t,
      zoneName,
    ],
  );

  const rect = sceneRect(viewport.w, viewport.h);
  const tint = sceneTint(night, now);

  /**
   * หน่วง 150ms ให้เห็นเอฟเฟกต์กดก่อนเปิดแผงโซน
   * เก็บ id ไว้เคลียร์ตอน unmount — ถ้ากดโซนแล้วออกจากหน้าทันที timer จะค้างอยู่
   */
  const pressTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (pressTimer.current != null) window.clearTimeout(pressTimer.current);
    },
    [],
  );

  const openZone = useCallback((id: ZoneId) => {
    setPressedId(id);
    if (pressTimer.current != null) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      setPressedId(null);
      setZoneId(id);
    }, 150);
  }, []);

  /**
   * รดน้ำเป็นคำสั่งของทั้งโรงเรือน — ไม่มีวาล์วรายโซน จึงสั่งเฉพาะแปลงเดียวไม่ได้
   * ส่งต่อให้ `command.waterAll()` เพื่อใช้ห่วงโซ่ความปลอดภัยเดียวกับปุ่มปั๊มในแผงควบคุม
   */
  const onWaterAll = useCallback(() => {
    setZoneId(null);
    command.waterAll();
  }, [command]);

  // เงื่อนไขอัตโนมัติ single source อยู่หน้าควบคุมโรงเรือน — แผงขั้นสูงในฉากลิงก์ไปที่นั่น
  const goToConditions = useCallback(() => navigate(ROUTES.greenhouse + '#gh-auto'), [navigate]);

  const togglePresentation = useCallback(() => {
    setPresentation((prev) => {
      flash(prev ? t.presToastOff : t.presToastOn);
      return !prev;
    });
  }, [flash, t]);

  const selectedZone = zoneId ? (zones.find((z) => z.id === zoneId) ?? null) : null;
  const dayNightLabel = night ? t.night : t.day;
  const timeLabel = hhmmBangkok(now);
  const clockLabel = `${timeLabel} · ${dayNightLabel}`;

  // ลำแสงเข้มตามค่า lux จริง ปิดสนิทตอนกลางคืนหรือเมื่อผู้ใช้ขอลดการเคลื่อนไหว
  const shaftOpacity =
    night || reduced ? 0 : 0.3 + 0.7 * Math.min(1, displayed.lux / CLIMATE_RANGE.lux.hi);

  const motes = !night && !reduced ? MOTES.slice(0, viewport.w < 700 ? 6 : 10) : [];
  const fireflies = night && !reduced ? FIREFLIES.slice(0, viewport.w < 700 ? 3 : 6) : [];

  return (
    <div ref={rootRef} className={s.root}>
      <img className={s.backdrop} src={sceneSrc(night, rain)} alt="" aria-hidden="true" />

      {/* อุปกรณ์ออฟไลน์ → ฉากโชว์ค่าค้าง (พัดลมยังหมุน/รดน้ำ ทั้งที่จริงหยุด) เตือนไม่ให้เข้าใจผิดว่าสด */}
      <div className={s.staleOverlay}>
        <StaleBanner />
        {/* กดหยุดฉุกเฉินจาก FAB ของฉากแล้วอุปกรณ์ยังไม่หยุด — ต้องเตือนตรงนี้ด้วย ไม่ใช่เฉพาะหน้าโรงเรือน */}
        <EstopDefiedAlert />
      </div>

      <div
        ref={sceneOuterRef}
        className={s.sceneOuter}
        style={{ left: rect.l, top: rect.t, width: rect.w, height: rect.h }}
      >
        <div className={s.drift}>
          <SceneImage night={night} rain={rain} tint={tint} alt={t.house} instant={!sceneSettled} />

          <SunShafts dayOpacity={night ? 0 : 1} shaftOpacity={shaftOpacity} />
          <LampGlow show={night} />
          <CloudShadows opacity={night || reduced ? 0 : 0.55} />
          <Birds show={!night && !reduced} />
          <Steam show={!presentation && !reduced && climate.rh > 80} />
          <HeatShimmer
            show={!presentation && !night && !reduced && climate.temp > 34}
            src={sceneSrc(false, rain)}
          />
          <DustMotes motes={motes} />
          <Fireflies fireflies={fireflies} />
          {/* ฝนตก: คงภาพพื้นหลัง (มืด/เปียก) + ป้ายฝน + **หยดน้ำบนกระจกหลังคา** (ไหลอยู่แถบบน ไม่ทับแปลง)
              ถอดเม็ดฝนตก/ฝนกระทบพื้น/หมอก/ฟ้าแลบออก เพราะดูเหมือนฝนตก "ในโรงเรือน" (เจ้าของงานสั่ง) */}
          <GlassDrops drips={rain && !reduced ? DRIPS : []} />
          <Vignette />

          <DeviceEffects devices={command.devices} />
          <WaterEffects zones={zones} />

          <ZonePins zones={zones} pressedId={pressedId} onPick={openZone} zoneName={zoneName} />
        </div>
      </div>

      <WeatherHud
        hudRef={hudRef}
        cards={cards}
        clockLabel={clockLabel}
        weather={weather}
        timeLabel={timeLabel}
        dayNightLabel={dayNightLabel}
        viewportWidth={viewport.w}
        onOpenMenu={() => setSidebarOpen(true)}
      />

      <RainChip show={rain} hudHeight={hudSize.h} />

      <AgentBear
        pose={agent.pose}
        message={agent.message}
        sleeping={agent.sleeping && !command.estop && !command.busy}
        reduced={reduced}
        maxHeight={viewport.h - 108}
      />

      <ControlDock
        command={command}
        open={controlsOpen}
        onOpen={() => setControlsOpen(true)}
        onClose={() => setControlsOpen(false)}
        onOpenAdvanced={() => {
          setControlsOpen(false);
          setAdvOpen(true);
        }}
        reduced={reduced}
      />

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentPath={location.pathname}
        lightMode={lightMode}
        onCycleLight={() => setLightMode(nextLightMode)}
        rainMode={rainMode}
        onCycleRain={() => setRainOverride((v) => (v === null ? true : v ? false : null))}
        presentation={presentation}
        onTogglePresentation={togglePresentation}
        onSoon={() => flash(t.soonToast)}
      />

      <ZonePanel
        zone={selectedZone}
        now={now}
        onClose={() => setZoneId(null)}
        onWater={onWaterAll}
        zoneName={zoneName}
        reduced={reduced}
      />

      <AdvancedPanel
        open={advOpen}
        onClose={() => setAdvOpen(false)}
        tab={advTab}
        onTab={setAdvTab}
        onGoToConditions={goToConditions}
        log={command.log}
        offlineCount={command.devices.filter((d) => !d.online).length}
        reduced={reduced}
      />

      <ConfirmDialog
        request={confirm.request}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onCancel={confirm.cancel}
        onAccept={confirm.accept}
      />

      <Toast message={toast} />
    </div>
  );
}
