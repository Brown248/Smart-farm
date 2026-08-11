import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { DeviceId } from '@shared/device';
import type { HsChannel } from '@shared/handysense';
import { EstopDefiedAlert, Toast } from '@/components/common';
import { RingGauge } from '@/components/charts/RingGauge';
import { CommandChannel } from '@/components/common/CommandChannel';
import { CommandConfirm } from '@/components/common/CommandConfirm';
import { Icon } from '@/components/common/Icon';
import { NumberField } from '@/components/common/NumberField';
import { DataPage } from '@/components/layout/DataPage';
import { HS_DAY_KEYS } from '@shared/handysense';
import { bigFanOffBlocked } from '@/lib/guards';
import {
  GH_DEVICES,
  GH_DEVICE_NUMBER,
  MAX_SCHEDULE_SLOTS,
  ghClimateCards,
} from '@/data/greenhouse';
import type { DeviceScheduleSlot, FanTempThreshold, GhDevice, GhMode } from '@/data/greenhouse';
import type { SensorSource } from '@/components/dashboard/SensorCard';
import type { LiveField } from '@/config/telemetryKeys';
import type { HsChannelState } from '@/config/deviceAttributes';
import { bondedTo, channelOf } from '@/config/deviceChannels';
import { useConfirm } from '@/hooks/useConfirm';
import { useDeviceCommand } from '@/hooks/useDeviceCommand';
import { useElapsedSeconds } from '@/hooks/useDashboardData';
import { formatCutoffLeft, usePumpCutoffLeft, usePumpCutoffToast } from '@/hooks/usePumpCutoff';
import { useToast } from '@/hooks/useToast';
import { useI18n } from '@/i18n/useI18n';
import type { Dict, TextKey } from '@/i18n/keys';
import { useFarmState } from '@/state/FarmStateProvider';
import { useLiveSnapshot } from '@/state/liveStatus';
import { useReducedMotion } from '@/lib/reducedMotion';
import { LED_CONFIRM_TIMEOUT_MS } from '@/lib/deviceTiming';
import g from '@/styles/dashboard.module.css';
import d from '@/components/dashboard/dashboard.module.css';
import s from './GreenhousePage.module.css';

/**
 * ป้ายที่มาของตัวเลขบนการ์ดสภาพอากาศ — ใช้ภาษาเดียวกับการ์ดเซนเซอร์บนแดชบอร์ดเป๊ะ
 * `stale` = เคยเป็นของจริงแต่เซนเซอร์หยุดส่งแล้ว ต้องแยกจาก `sim` (ยังไม่ได้ต่อ) ให้ชัด
 */
// CSS Modules คืน `string | undefined` (คลาสหายไปเงียบๆ ได้ — `cssPairing.test.ts` เป็นตัวจับ)
const srcClass = (src: SensorSource): string | undefined =>
  src === 'live' ? d.senSrcLive : src === 'stale' ? d.senSrcStale : d.senSrcSim;
const srcLabel = (src: SensorSource, t: Dict): string =>
  src === 'live' ? t.liveTag : src === 'stale' ? t.staleTag : t.simTag;
const srcHint = (src: SensorSource, t: Dict): string =>
  src === 'live' ? t.liveTag : src === 'stale' ? t.staleTagHint : t.simTagHint;

/** ชื่ออุปกรณ์ที่ผู้ใช้เห็น — ใช้คีย์เดียวกับฉากเกม */
const deviceLabel = (id: DeviceId, nameKey: TextKey, t: Dict): string => {
  const n = GH_DEVICE_NUMBER[id];
  return t[nameKey] + (n ? ' #' + n : '');
};

type CommandApi = ReturnType<typeof useDeviceCommand>;
type ConfirmApi = ReturnType<typeof useConfirm>;

/**
 * การ์ดอุปกรณ์ (สวิตช์เปิด/ปิด + สถานะ + ปุ่มโหมด) — แยกออกมาแล้ว `memo`
 * เพื่อไม่ให้ re-render ทุก 3.2 วิ ตอนค่าอากาศ (climate) ขยับ → สวิตช์เลื่อนลื่นไม่กระตุก
 * รับเฉพาะ prop ที่นิ่ง (สถานะอุปกรณ์ + callback ที่ useCallback ไว้) ไม่รับ `climate`
 */
interface DeviceControlCardProps {
  readonly dev: GhDevice;
  readonly isOn: boolean;
  readonly pending: 'on' | 'off' | null;
  readonly offline: boolean;
  readonly emergency: boolean;
  readonly realControl: boolean;
  readonly channel: HsChannel | null;
  readonly channelState: HsChannelState | undefined;
  readonly mode: GhMode;
  readonly deviceStale: boolean;
  /**
   * ใครสั่งพัดลมตัวนี้อยู่ — `'system'` = ระบบความชื้นคุม · `'manual'` = ผู้ใช้แย่งคุมไว้รอบนี้
   * `null` = ไม่เกี่ยวกับระบบความชื้น (ปั๊ม หรือรอบดูดยังไม่ถึงตัวนี้)
   */
  readonly ventRole: 'system' | 'manual' | null;
  /**
   * เวลาที่เหลือก่อนระบบตัดปั๊มเอง ("12:34") — `null` = ไม่ได้นับอยู่ / ไม่ใช่ปั๊ม
   *
   * ต้องเห็นตั้งแต่ปั๊มเริ่มเดิน ไม่ใช่รู้ตอนมันดับไปแล้ว (ดู `usePumpCutoff`)
   */
  readonly cutoffLeft: string | null;
  readonly t: Dict;
  readonly reduced: boolean;
  readonly onPress: (id: DeviceId) => void;
  readonly onToggleMode: (id: DeviceId, mode: GhMode) => void;
}

const DeviceControlCard = memo(function DeviceControlCard({
  dev,
  isOn,
  pending,
  offline,
  emergency,
  realControl,
  channel,
  channelState,
  mode,
  deviceStale,
  ventRole,
  cutoffLeft,
  t,
  reduced,
  onPress,
  onToggleMode,
}: DeviceControlCardProps) {
  const isPending = pending !== null;
  // ลูกบิดเลื่อนไปทิศที่กด "ทันที" (optimistic) — ค่าที่อุปกรณ์กำลังจะเป็น (pending ถ้ามี ไม่งั้นค่าจริง)
  // แต่ aria-label/aria-checked ยังผูกกับ `isOn` (ค่าที่อุปกรณ์ยืนยันจริง) — คงกฎ "แยกสั่งแล้ว/ยืนยันแล้ว"
  const displayOn = isPending ? pending === 'on' : isOn;
  // ตัวพ่วง (พัดลมเล็ก ต่อสายกับใหญ่ #1) — คุมแยกไม่ได้ · สถานะตามตัวหลัก · ปิดปุ่ม
  const master = bondedTo(dev.id);
  const masterName = master ? deviceLabel(master, master === 'pump' ? 'pump' : 'bigFan', t) : '';
  const noRealRelay = realControl && channel === null;
  // ช่องที่มี automation จริงทำงานอยู่ → กดอาจถูกทับ (guide ข้อ 6.1)
  const autoOverride = realControl && channel !== null && channelState?.mode === 'auto';
  const blocked = offline || emergency || isPending || noRealRelay || master !== null;
  const name = deviceLabel(dev.id, dev.nameKey, t);
  const stateLabel = isPending
    ? t.stateSending
    : offline
      ? t.stateOffline
      : isOn
        ? t.stateOn
        : t.stateOff;
  const stateColor = isPending
    ? 'var(--d-warn)'
    : offline
      ? '#a8302b'
      : isOn
        ? 'var(--d-ok-ink)'
        : 'var(--d-muted)';
  // อัตโนมัติเปิดอยู่ไหม — โหมดจริงอ่านจากอุปกรณ์จริง · โหมดจำลองใช้ค่าที่ตั้งไว้
  const cardAutoOn =
    realControl && channel !== null ? channelState?.mode === 'auto' : mode === 'auto';

  return (
    <div
      className={[
        g.glass,
        g.lift,
        s.deviceCard,
        isOn && !offline ? s.deviceCardOn : null,
        offline ? s.deviceCardOffline : null,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={s.deviceTop}>
        <span
          className={[s.deviceIcon, isOn && !offline ? s.deviceIconOn : null]
            .filter(Boolean)
            .join(' ')}
          aria-hidden="true"
        >
          <Icon
            name={dev.icon}
            size={20}
            color={isOn && !offline ? 'var(--brand-green)' : 'var(--d-muted)'}
          />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={s.deviceName}>{name}</div>
          <div className={s.deviceSub}>{t[dev.subKey]}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          aria-label={`${name} — ${isOn ? t.stateOn : t.stateOff}`}
          disabled={blocked}
          className={[s.switch, displayOn ? s.switchOn : null, isPending ? s.switchPending : null]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onPress(dev.id)}
        >
          <span
            className={[s.knob, displayOn ? s.knobOn : null].filter(Boolean).join(' ')}
            aria-hidden="true"
          />
          {isPending ? <span className={s.spinner} aria-hidden="true" /> : null}
        </button>
      </div>

      <div className={s.stateRow}>
        <span
          className={s.stateDot}
          aria-hidden="true"
          style={{
            background: stateColor,
            ...(isPending && !reduced ? { animation: 'sy-pulse 1s ease-in-out infinite' } : {}),
          }}
        />
        <span className={s.stateLabel} style={{ color: stateColor }}>
          {stateLabel}
        </span>
        {offline ? <span className={s.offlineTag}>{t.offline}</span> : null}
        {/* อุปกรณ์ออฟไลน์ (shadow_ts เก่า) — ค่าที่เห็นเป็นค่าค้าง ไม่ใช่สถานะสด */}
        {deviceStale && !offline ? <span className={s.staleTag}>{t.staleTag}</span> : null}
        {/* ใครกำลังสั่งพัดลมตัวนี้อยู่ — ไม่งั้นผู้ใช้จะงงว่าทำไมอยู่ๆ มันเปิด/ปิดเอง */}
        {ventRole !== null ? (
          <span className={s.ventTag}>
            {ventRole === 'system' ? t.ventOwnedBadge : t.ventOverridden}
          </span>
        ) : null}
      </div>

      {/* ป้ายสถานะ: พ่วงตัวหลัก / ยังไม่ต่อ relay / automation ที่อาจทับการกดปุ่ม */}
      {master ? (
        <div className={s.notLiveNote} role="note">
          <Icon name="info" size={14} color="var(--d-muted)" strokeWidth={1.9} />
          <span>{t.ghBondedFollows(masterName)}</span>
        </div>
      ) : dev.id === 'pump' ? (
        <div className={s.notLiveNote} role="note">
          <Icon name="fan" size={14} color="var(--d-muted)" strokeWidth={1.9} />
          <span>{t.ghPumpFollowsFans}</span>
        </div>
      ) : noRealRelay ? (
        <div className={s.notLiveNote} role="note">
          <Icon name="info" size={14} color="var(--d-muted)" strokeWidth={1.9} />
          <span>{t.hsPumpNotWired}</span>
        </div>
      ) : autoOverride ? (
        <div className={s.notLiveNote} role="note">
          <Icon name="alert" size={14} color="var(--d-warn)" strokeWidth={1.9} />
          <span>{t.hsAutoOverride}</span>
        </div>
      ) : null}

      {/*
       * นับถอยหลังก่อนระบบตัดปั๊ม — `role="status"` เพราะเป็นค่าที่เปลี่ยนตลอด (ไม่ใช่ note คงที่)
       * ถ้าไม่บอกล่วงหน้า ผู้ใช้จะเห็นแค่ "ปั๊มดับเอง" แล้วเข้าใจว่าอุปกรณ์เสีย
       */}
      {cutoffLeft !== null ? (
        <div className={s.notLiveNote} role="status">
          <Icon name="clock" size={14} color="var(--d-warn-ink)" strokeWidth={1.9} />
          <span>
            {t.pumpCutoffIn(cutoffLeft)} · {t.pumpCutoffWhy}
          </span>
        </div>
      ) : null}

      {/* ปุ่มโหมดอัตโนมัติบนการ์ด: โหมดจำลอง = toggle local · โหมดจริง = สะท้อนสถานะจริง (ปิดการกด) */}
      <button
        type="button"
        aria-pressed={cardAutoOn}
        aria-label={`${name} — ${t.ghModeAuto}`}
        disabled={offline || emergency || realControl || master !== null}
        className={[s.autoBtn, cardAutoOn ? s.autoBtnOn : null].filter(Boolean).join(' ')}
        onClick={() => onToggleMode(dev.id, mode === 'auto' ? 'manual' : 'auto')}
      >
        <Icon
          name="gear"
          size={14}
          color={cardAutoOn ? 'var(--brand-green)' : 'var(--d-muted)'}
          strokeWidth={1.9}
        />
        {t.ghModeAuto}
      </button>
    </div>
  );
});

/**
 * การ์ดเงื่อนไขต่อพัดลม — แท็บ "อุณหภูมิ / ตารางเวลา" โชว์ทีละอย่าง (ไม่ยัดพร้อมกันให้รก)
 * มี state แท็บของตัวเอง จึงต้องแยกเป็น component (เรียก useState ใน .map() ไม่ได้)
 */
interface DeviceConditionCardProps {
  readonly dev: GhDevice;
  readonly name: string;
  readonly th: FanTempThreshold;
  readonly slots: readonly DeviceScheduleSlot[];
  readonly channel: HsChannel | null;
  readonly chState: HsChannelState | undefined;
  readonly realControl: boolean;
  readonly offline: boolean;
  readonly emergency: boolean;
  readonly t: Dict;
  readonly onSetThreshold: (id: DeviceId, patch: Partial<FanTempThreshold>) => void;
  readonly onSendThreshold: CommandApi['sendThreshold'];
  readonly onDisableTempAuto: CommandApi['disableTempAuto'];
  readonly onSetSchedule: (id: DeviceId, slots: readonly DeviceScheduleSlot[]) => void;
  readonly onScheduleToggle: CommandApi['sendScheduleToggle'];
  readonly onScheduleSave: CommandApi['sendScheduleSave'];
  readonly onScheduleDelete: CommandApi['sendScheduleDelete'];
  readonly onConfirmAsk: ConfirmApi['ask'];
}

const DeviceConditionCard = memo(function DeviceConditionCard({
  dev,
  name,
  th,
  slots,
  channel,
  chState,
  realControl,
  offline,
  emergency,
  t,
  onSetThreshold,
  onSendThreshold,
  onDisableTempAuto,
  onSetSchedule,
  onScheduleToggle,
  onScheduleSave,
  onScheduleDelete,
  onConfirmAsk,
}: DeviceConditionCardProps) {
  const [view, setView] = useState<'auto' | 'sched'>('auto');

  // ── แท็บ อุณหภูมิ ──
  // ค่าจริงจากอุปกรณ์ (real) / ค่าที่ตั้งไว้ (sim) แล้วซ้อน "optimistic" ตอนกด — ลูกบิดขยับทันที
  // ไม่ต้องรอ ~10 วิให้อุปกรณ์รายงานเกณฑ์กลับมา (เหมือนสวิตช์เปิด/ปิดอุปกรณ์)
  const autoOnDevice = realControl ? chState?.temp.on === true : th.enabled;
  const [autoWish, setAutoWish] = useState<boolean | null>(null);
  // อุปกรณ์ยืนยันตรงกับที่สั่งแล้ว → เลิก optimistic (กลับไปเชื่อค่าจริง)
  useEffect(() => {
    if (autoWish !== null && autoOnDevice === autoWish) setAutoWish(null);
  }, [autoOnDevice, autoWish]);
  // อุปกรณ์ไม่ยืนยันภายในเวลา → เลิก optimistic กลับไปโชว์ค่าจริง (กันค้างท่าที่สั่ง)
  useEffect(() => {
    if (autoWish === null) return;
    const id = window.setTimeout(() => setAutoWish(null), LED_CONFIRM_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [autoWish]);
  const autoOn = autoWish ?? autoOnDevice;
  const autoPending = autoWish !== null && autoWish !== autoOnDevice;
  const autoDisabled = offline || emergency;
  const toggleAutoTemp = () => {
    const next = !autoOn;
    if (realControl) {
      setAutoWish(next);
      // เปิดออโต้ = ให้อุปกรณ์คุมเอง (setThreshold) · ปิดออโต้ = ปิด auto **พร้อมสั่งดับรีเลย์จริง**
      // (เดิมปิดออโต้แล้วพัดลมไม่ดับ เพราะส่งแค่ no-auto ไม่ได้ setSwitch off) · G2 เตือน/ยืนยันในเมธอด
      if (next) onSendThreshold(dev.id, { enabled: true, min: th.min, max: th.max });
      else onDisableTempAuto(dev.id);
    } else {
      // โหมดจำลอง (เดโม · ไม่ได้ล็อกอิน): เปลี่ยนโหมดอย่างเดียว — การสั่งดับรีเลย์จริงมีเฉพาะโหมดควบคุมจริง
      onSetThreshold(dev.id, { enabled: next });
    }
  };
  const commitField = (field: 'min' | 'max', value: number) => {
    onSetThreshold(dev.id, { [field]: value });
    if (realControl && autoOn) {
      const merged = { ...th, [field]: value };
      onSendThreshold(dev.id, { enabled: true, min: merged.min, max: merged.max });
    }
  };

  return (
    <div className={s.autoCard}>
      <div className={s.autoCardHead}>
        <Icon name={dev.icon} size={17} color="var(--brand-green)" strokeWidth={1.9} />
        <span className={s.autoCardName}>{name}</span>
      </div>

      {/*
        สลับ อุณหภูมิ / ตารางเวลา — โชว์ทีละอัน ตารางเวลาไม่โผล่รกจนกว่าจะกดแท็บ
        ปั๊มไม่มีเกณฑ์อุณหภูมิ จึงไม่ต้องมีแถบแท็บเลย (แท็บเดียวให้กดคือปุ่มหลอก)
      */}
      <div className={s.segRow}>
        <button
          type="button"
          aria-pressed={view === 'auto'}
          aria-label={`${name} · ${t.ghTabTemp}`}
          className={[s.segTab, view === 'auto' ? s.segTabOn : null].filter(Boolean).join(' ')}
          onClick={() => setView('auto')}
        >
          <Icon name="temp" size={14} color="var(--d-m-temp)" strokeWidth={1.9} />
          {t.ghTabTemp}
        </button>
        <button
          type="button"
          aria-pressed={view === 'sched'}
          aria-label={`${name} · ${t.ghSchedTitle}`}
          className={[s.segTab, view === 'sched' ? s.segTabOn : null].filter(Boolean).join(' ')}
          onClick={() => setView('sched')}
        >
          <Icon name="clock" size={14} color="var(--d-warn)" strokeWidth={1.9} />
          {t.ghSchedTitle}
        </button>
      </div>

      {view === 'auto' ? (
        <div className={s.ruleList}>
          <div className={s.autoSwitchRow}>
            <div className={s.schedLabel}>
              <Icon name="temp" size={14} color="var(--d-m-temp)" strokeWidth={1.9} />
              {t.ghTempAutoTitle}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoOnDevice}
              aria-label={`${name} — ${t.ghTempAutoTitle}`}
              disabled={autoDisabled || autoPending}
              className={[
                s.switch,
                autoOn ? s.switchOn : null,
                autoPending ? s.switchPending : null,
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={toggleAutoTemp}
            >
              <span
                className={[s.knob, autoOn ? s.knobOn : null].filter(Boolean).join(' ')}
                aria-hidden="true"
              />
              {autoPending ? <span className={s.spinner} aria-hidden="true" /> : null}
            </button>
          </div>

          {autoOn ? (
            <>
              {/* ทิศทางเป็นป้ายกำกับช่องตรงๆ — กัน min/max สลับ (จุดพลาดอันดับ 1) */}
              <div className={s.ruleRow}>
                <label className={s.ruleLabel} htmlFor={`gh-${dev.id}-min`}>
                  {t.ghTempMinLabel}
                </label>
                <NumberField
                  id={`gh-${dev.id}-min`}
                  className={s.ruleInput}
                  ariaLabel={`${name} · ${t.ghTempMinLabel}`}
                  min={0}
                  max={60}
                  value={th.min}
                  onCommit={(next) => commitField('min', next)}
                />
                <span className={s.ruleUnit}>°C</span>
              </div>
              <div className={s.ruleRow}>
                <label className={s.ruleLabel} htmlFor={`gh-${dev.id}-max`}>
                  {t.ghTempMaxLabel}
                </label>
                <NumberField
                  id={`gh-${dev.id}-max`}
                  className={s.ruleInput}
                  ariaLabel={`${name} · ${t.ghTempMaxLabel}`}
                  min={0}
                  max={60}
                  value={th.max}
                  onCommit={(next) => commitField('max', next)}
                />
                <span className={s.ruleUnit}>°C</span>
              </div>
              {realControl &&
              chState?.temp.on &&
              chState.temp.min !== null &&
              chState.temp.max !== null ? (
                <div className={s.notLiveNote} role="note">
                  <Icon name="info" size={14} color="var(--d-muted)" strokeWidth={1.9} />
                  <span>
                    {t.ghDeviceThreshNow(String(chState.temp.min), String(chState.temp.max))}
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <div className={s.notLiveNote} role="note">
              <Icon name="info" size={14} color="var(--d-muted)" strokeWidth={1.9} />
              <span>{t.ghAutoOffHint}</span>
            </div>
          )}
        </div>
      ) : (
        <div className={s.schedBlock}>
          {slots.map((slot, i) => {
            const setSlot = (patch: Partial<DeviceScheduleSlot>) =>
              onSetSchedule(
                dev.id,
                slots.map((x, j) => (j === i ? { ...x, ...patch } : x)),
              );
            const realSlot = realControl && channel !== null;
            const toggleUse = () => {
              const next = !slot.enable;
              setSlot({ enable: next });
              if (realSlot) onScheduleToggle(dev.id, slot.slot, next);
            };
            const removeLocal = () =>
              onSetSchedule(
                dev.id,
                slots.filter((_, j) => j !== i),
              );
            const removeSlot = () => {
              if (!realSlot) return removeLocal();
              onConfirmAsk({
                title: t.ghSchedDelTitle,
                body: t.ghSchedDelBody,
                tone: 'warn',
                confirmLabel: t.ghSchedDelConfirm,
                run: () => {
                  onScheduleDelete(dev.id, slot.slot);
                  removeLocal();
                },
              });
            };
            return (
              // key ต้องเป็น slot จริงไม่ใช่ index — ลบช่วงกลางทางแล้ว React จะจับคู่การ์ดผิดตัว
              <div key={slot.slot} className={s.slotCard}>
                <div className={s.slotHead}>
                  <span className={s.slotName}>{t.ghSchedSlot(slot.slot + 1)}</span>
                  <button
                    type="button"
                    className={s.schedRemove}
                    // ต้องเป็นเลขเดียวกับที่ตาเห็นด้านซ้าย (`slot.slot + 1`) ไม่ใช่ลำดับในลิสต์
                    // ลบช่วงกลางทางแล้วสองเลขจะไม่ตรงกัน — คนใช้ screen reader จะกดผิดช่วง
                    aria-label={`${name} · ${t.ghSchedDelSlot} ${slot.slot + 1}`}
                    onClick={removeSlot}
                  >
                    <Icon name="close" size={14} strokeWidth={2.2} />
                  </button>
                </div>

                <div className={s.autoSwitchRow}>
                  <span className={s.slotName}>{t.ghSchedUse}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={slot.enable}
                    aria-label={`${name} · ${t.ghSchedSlot(slot.slot + 1)} · ${
                      slot.enable ? t.stateOn : t.stateOff
                    }`}
                    disabled={offline || emergency}
                    className={[s.switch, slot.enable ? s.switchOn : null]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={toggleUse}
                  >
                    <span
                      className={[s.knob, slot.enable ? s.knobOn : null].filter(Boolean).join(' ')}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                <div className={s.dayRow}>
                  {HS_DAY_KEYS.map((dk) => (
                    <button
                      key={dk}
                      type="button"
                      aria-pressed={slot.days[dk]}
                      aria-label={`${name} · ${t.ghSchedSlot(slot.slot + 1)} · ${dk}`}
                      className={[s.dayBtn, slot.days[dk] ? s.dayBtnOn : null]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setSlot({ days: { ...slot.days, [dk]: !slot.days[dk] } })}
                    >
                      {t.dayShort(dk)}
                    </button>
                  ))}
                </div>

                <div className={s.schedRow}>
                  <span>{t.ghSchedAt}</span>
                  <input
                    type="time"
                    className={s.schedInput}
                    aria-label={`${name} · ${t.ghSchedSlot(slot.slot + 1)} · ${t.ghSchedAt}`}
                    value={slot.startTime}
                    onChange={(e) => setSlot({ startTime: e.target.value })}
                  />
                  <span>{t.ghSchedEnd}</span>
                  <input
                    type="time"
                    className={s.schedInput}
                    aria-label={`${name} · ${t.ghSchedSlot(slot.slot + 1)} · ${t.ghSchedEnd}`}
                    value={slot.endTime}
                    onChange={(e) => setSlot({ endTime: e.target.value })}
                  />
                </div>

                {realSlot ? (
                  <div className={s.threshBtns}>
                    <button
                      type="button"
                      className={s.threshBtn}
                      onClick={() => onScheduleSave(dev.id, slot)}
                    >
                      {t.ghSchedSave}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {slots.length < MAX_SCHEDULE_SLOTS ? (
            <button
              type="button"
              className={s.schedAdd}
              aria-label={`${name} · ${t.ghSchedAddSlot}`}
              onClick={() => {
                const used = new Set(slots.map((x) => x.slot));
                const next = [0, 1, 2].find((n) => !used.has(n));
                if (next === undefined) return;
                onSetSchedule(dev.id, [
                  ...slots,
                  {
                    slot: next,
                    enable: true,
                    days: {
                      mon: true,
                      tue: true,
                      wed: true,
                      thu: true,
                      fri: true,
                      sat: true,
                      sun: true,
                    },
                    startTime: '12:00',
                    endTime: '13:00',
                  },
                ]);
              }}
            >
              <Icon name="plus" size={13} strokeWidth={2.2} />
              {t.ghSchedAddSlot}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
});

/**
 * แบนเนอร์ควบคุมความชื้น (ของทั้งโรงเรือน) — แยกหน้าตาจากการ์ดรายพัดลมให้ลำดับชั้นชัด
 * โชว์ RH ปัจจุบัน จึง re-render ตามค่าจริง (ไม่ memo) แต่เป็นการ์ดเดียว เบา
 */
interface HumidityBannerProps {
  readonly humidityAuto: ReturnType<typeof useFarmState>['humidityAuto'];
  readonly setHumidityAuto: ReturnType<typeof useFarmState>['setHumidityAuto'];
  readonly ventStage: number;
  readonly rhReal: boolean;
  readonly rh: number;
  /** อุณหภูมิ (สำหรับกฎ G2 ตอนปิด — เตือนถ้าจะดับพัดลมใหญ่ตัวสุดท้ายขณะร้อน) */
  readonly temp: number;
  /** ปิดระบบความชื้นแล้วจะยังมีพัดลมใหญ่เดินอยู่ไหม — ตัวแปรที่ G2 ต้องใช้ตัดสิน */
  readonly bigFanStillRunningAfter: boolean;
  readonly emergency: boolean;
  readonly onConfirmAsk: ConfirmApi['ask'];
  readonly t: Dict;
}

export function HumidityBanner({
  humidityAuto,
  setHumidityAuto,
  ventStage,
  rhReal,
  rh,
  temp,
  bigFanStillRunningAfter,
  emergency,
  onConfirmAsk,
  t,
}: HumidityBannerProps) {
  const validRange = humidityAuto.onAt > humidityAuto.offAt;
  const stageLabel =
    ventStage === 2 ? t.humStatusVent2 : ventStage === 1 ? t.humStatusVent1 : t.humStatusOff;
  /*
   * ปิดสวิตช์ = สั่งดับพัดลมจริง (เหมือนปุ่มออโต้พัดลม) → ต้องผ่านกฎ G2 ชุดเดียวกับที่อื่น
   *
   * **ห้ามเขียนเงื่อนไข G2 เองตรงนี้** — ของเดิมเช็คแค่ `temp > BIG_FAN_LOCK_TEMP` โดยลืมว่า
   * G2 จะติดก็ต่อเมื่อ "ไม่มีพัดลมใหญ่ตัวอื่นเดินอยู่" ทำให้เตือนผิดเมื่อผู้ใช้เปิดใบ #2 ไว้เอง
   * เป็นบั๊กตระกูลเดียวกับที่ CLAUDE.md บันทึกไว้: หน้าเขียนกฎความปลอดภัยเอง แล้ว
   * `safetyParity.test.ts` ผ่านตลอดเพราะทดสอบ `guards.ts` แยกส่วน ("ฟังก์ชันถูก แต่ไม่มีใครเรียก")
   */
  const toggleHum = () => {
    if (humidityAuto.enabled && ventStage >= 1 && bigFanOffBlocked(temp, bigFanStillRunningAfter)) {
      onConfirmAsk({
        title: t.guardWarnTitle,
        body: t.guardBigFan(temp.toFixed(1)),
        tone: 'warn',
        confirmLabel: t.guardProceed,
        run: () => setHumidityAuto({ enabled: false }),
      });
      return;
    }
    setHumidityAuto({ enabled: !humidityAuto.enabled });
  };
  return (
    <div className={s.humBanner}>
      <div className={s.humBannerHead}>
        <span className={s.humBannerTitle}>
          <Icon name="drop" size={16} color="var(--d-m-hum)" strokeWidth={1.9} />
          {t.humTitle}
          <span className={s.humScope}>{t.humScope}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={humidityAuto.enabled}
          aria-label={t.humEnable}
          disabled={emergency}
          className={[s.switch, humidityAuto.enabled ? s.switchOn : null].filter(Boolean).join(' ')}
          onClick={toggleHum}
        >
          <span
            className={[s.knob, humidityAuto.enabled ? s.knobOn : null].filter(Boolean).join(' ')}
            aria-hidden="true"
          />
        </button>
      </div>
      <p className={g.sub} style={{ margin: 0 }}>
        {t.humSub}
      </p>

      {humidityAuto.enabled ? (
        <>
          <div className={s.ruleRow}>
            <label className={s.ruleLabel} htmlFor="hum-on">
              {t.humOnAt}
            </label>
            <NumberField
              id="hum-on"
              className={s.ruleInput}
              ariaLabel={t.humOnAt}
              min={0}
              max={100}
              value={humidityAuto.onAt}
              onCommit={(next) => setHumidityAuto({ onAt: next })}
            />
            <span className={s.ruleUnit}>%</span>
          </div>
          <div className={s.ruleRow}>
            <label className={s.ruleLabel} htmlFor="hum-off">
              {t.humOffAt}
            </label>
            <NumberField
              id="hum-off"
              className={s.ruleInput}
              ariaLabel={t.humOffAt}
              min={0}
              max={100}
              value={humidityAuto.offAt}
              onCommit={(next) => setHumidityAuto({ offAt: next })}
            />
            <span className={s.ruleUnit}>%</span>
          </div>
          {!validRange ? (
            <div className={s.notLiveNote} role="alert">
              <Icon name="alert" size={14} color="var(--d-warn)" strokeWidth={1.9} />
              <span>{t.humInvalidRange}</span>
            </div>
          ) : null}

          <div className={s.autoSwitchRow}>
            <span className={s.slotName}>{t.humUseWindow}</span>
            <button
              type="button"
              role="switch"
              aria-checked={humidityAuto.useWindow}
              aria-label={t.humUseWindow}
              className={[s.switch, humidityAuto.useWindow ? s.switchOn : null]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setHumidityAuto({ useWindow: !humidityAuto.useWindow })}
            >
              <span
                className={[s.knob, humidityAuto.useWindow ? s.knobOn : null]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden="true"
              />
            </button>
          </div>
          {humidityAuto.useWindow ? (
            <div className={s.schedRow}>
              <span>{t.humWindow}</span>
              <input
                type="time"
                className={s.schedInput}
                aria-label={`${t.humWindow} · ${t.ghSchedAt}`}
                value={humidityAuto.windowStart}
                onChange={(e) => setHumidityAuto({ windowStart: e.target.value })}
              />
              <span>{t.ghSchedEnd}</span>
              <input
                type="time"
                className={s.schedInput}
                aria-label={`${t.humWindow} · ${t.ghSchedEnd}`}
                value={humidityAuto.windowEnd}
                onChange={(e) => setHumidityAuto({ windowEnd: e.target.value })}
              />
            </div>
          ) : (
            <div className={s.notLiveNote} role="note">
              <Icon name="info" size={14} color="var(--d-muted)" strokeWidth={1.9} />
              <span>{t.humWindowAll}</span>
            </div>
          )}

          <div className={s.notLiveNote} role="status">
            <Icon
              name={ventStage > 0 ? 'fan' : 'info'}
              size={14}
              color={ventStage > 0 ? 'var(--brand-green)' : 'var(--d-muted)'}
              strokeWidth={1.9}
            />
            <span>
              {stageLabel} · {rhReal ? t.humRhNow(String(Math.round(rh))) : t.humRhNoReal}
            </span>
          </div>
          <div className={s.notLiveNote} role="note">
            <Icon name="info" size={14} color="var(--d-muted)" strokeWidth={1.9} />
            <span>{t.humAppOnlyNote}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function GreenhousePage() {
  const { t } = useI18n();
  const { toast, flash } = useToast();
  // ปั๊มถูกตัดอัตโนมัติ = เหตุการณ์ที่ผู้ใช้ต้องรู้ทันที ไม่ใช่ไปเจอทีหลังในสมุดบันทึก
  usePumpCutoffToast(flash, t.pumpCutoffToast);
  const cutoffMs = usePumpCutoffLeft();
  const cutoffLeft = cutoffMs === null ? null : formatCutoffLeft(cutoffMs);
  const reduced = useReducedMotion();
  const location = useLocation();
  // อุปกรณ์ออฟไลน์ (shadow_ts เก่า) → การ์ดขึ้นป้าย "ค่าค้าง" · อ่านจาก store เดียวกับ ConnectionPill
  // deviceBanned (netpie_banned) → ถูกระงับ · ต้องกันปุ่มทั้งหมด (กดแล้วระบบตอบ ok:true แต่อุปกรณ์ไม่ได้รับ)
  const { deviceStale, deviceBanned } = useLiveSnapshot();
  // ฉากเกมลิงก์มาที่ #gh-auto (ส่วนเงื่อนไขอัตโนมัติ) — เลื่อนไปให้เห็นเมื่อมี hash นี้
  useEffect(() => {
    if (location.hash === '#gh-auto') {
      document.getElementById('gh-auto')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  /**
   * สถานะจริงของอุปกรณ์มาจากส่วนกลาง ไม่ใช่ของหน้านี้เอง
   * เดิมหน้านี้เก็บ `on` แยก ทำให้ปั๊มที่ฉากเกมบอกว่าเปิด หน้านี้กลับบอกว่าปิด
   * `GH_DEVICES` เหลือหน้าที่แค่ให้ข้อมูลหน้าตา (ชื่อ · ไอคอน · เงื่อนไข · ตารางเวลา)
   */
  const {
    devices,
    modes: mode,
    setMode,
    estop: emergency,
    climate,
    live,
    realControl,
    channelStates,
    deviceThresholds,
    setDeviceThreshold,
    deviceSchedules,
    setDeviceSchedule,
    humidityAuto,
    setHumidityAuto,
    humidityVentStage,
    ventOwned,
    pumpManual,
  } = useFarmState();

  /**
   * โหมดจริง: เติมตัวแก้ (เกณฑ์อุณหภูมิ + ตารางเวลา) จาก **อุปกรณ์จริง**
   * ไม่งั้นตัวแก้จะโชว์ค่า default ปลอม แล้วกด "บันทึก/ส่ง" ไปทับค่าจริงของอุปกรณ์ (ตั้ง automation ที่ไม่ได้ตั้งใจ)
   *
   * กติกา 3 ข้อ ที่มาจากบั๊กจริงคนละตัว:
   *   1. ต้องมีค่าจริง **ของช่องนั้น** ก่อน (`led{ch}`) ไม่ผูกกับ led0 ตัวเดียว
   *   2. ต้องมี **attribute เกณฑ์** มาถึงด้วย (`hasThresholdAttrs`) — attribute ไหลเข้ามาสะสมทีละก้อน
   *      `led` มาก่อนเกณฑ์ได้ ถ้าเติมตอนนั้นจะได้ "ปิด / 30-35" ซึ่งเป็นค่าปลอม
   *   3. หยุดเติมเมื่อ **ผู้ใช้เริ่มแก้ฟอร์มแล้ว** (`dirtyRef`) ไม่ใช่ "เติมไปแล้วครั้งหนึ่ง"
   *      ของเดิมล็อกที่ "เติมแล้ว" ทำให้ค่าจริงที่มาช้ากว่าไม่มีวันเข้าถึงฟอร์มได้เลย
   *      และถ้าเจ้าของระบบไปปรับเกณฑ์จากแอปมือถือ หน้าเราก็จะโกหกตลอดไป
   *
   * เขียนทับเฉพาะตอน**ค่าฝั่งอุปกรณ์เปลี่ยนจริง** (เทียบ signature) ไม่งั้นจะ setState ทุกรอบ attribute
   */
  const dirtyRef = useRef<Set<DeviceId>>(new Set());
  /**
   * แยกลายเซ็นของ "เกณฑ์" กับ "ตารางเวลา" ออกจากกัน — **ห้ามรวมเป็นตัวเดียว**
   *
   * ของเดิมรวมกันแล้วใช้เงื่อนไข `hasThreshold` คุมทั้งคู่ ทั้งที่ตารางเวลาไม่ได้เกี่ยวอะไร
   * กับ attribute เกณฑ์อุณหภูมิเลย → ช่องที่ไม่เคยส่ง `min_temp`/`max_temp` มา
   * (เช่นปั๊มซึ่งจงใจไม่ผูกกับอุณหภูมิ) จะ **ไม่มีวันเติมตารางเวลาจริงลงฟอร์ม**
   * ผู้ใช้เห็นตารางว่างทั้งที่อุปกรณ์มีตารางตั้งอยู่ = จอโกหกแบบเดียวกับที่ B3 แก้ไป
   */
  const seededThreshRef = useRef<Partial<Record<DeviceId, string>>>({});
  const seededSchedRef = useRef<Partial<Record<DeviceId, string>>>({});
  useEffect(() => {
    if (!channelStates) return; // null = ไม่ใช่โหมดจริง
    const ALL: Record<string, boolean> = {
      mon: true,
      tue: true,
      wed: true,
      thu: true,
      fri: true,
      sat: true,
      sun: true,
    };
    for (const dev of GH_DEVICES) {
      const ch = channelOf(dev.id);
      if (ch === null || dirtyRef.current.has(dev.id)) continue;
      const state = channelStates[ch];
      if (!state || state.on === null) continue;

      // ── เกณฑ์อุณหภูมิ — ต้องรอ attribute เกณฑ์มาถึงจริงก่อน ไม่งั้นได้ค่า default ปลอม ──
      if (state.hasThreshold) {
        const sig = JSON.stringify(state.temp);
        if (seededThreshRef.current[dev.id] !== sig) {
          seededThreshRef.current[dev.id] = sig;
          // อุปกรณ์ไม่มีเกณฑ์ (0,0) → โชว์ "ปิด" ไม่ใช่ default ปลอม
          const temp = state.temp;
          setDeviceThreshold(
            dev.id,
            temp.on
              ? { enabled: true, min: temp.min ?? 30, max: temp.max ?? 35 }
              : { enabled: false, min: 30, max: 35 },
          );
        }
      }

      // ── ตารางเวลา — คนละ attribute คนละเรื่อง ห้ามให้เกณฑ์อุณหภูมิมาคุม ──
      const schedSig = JSON.stringify(state.timers);
      if (seededSchedRef.current[dev.id] !== schedSig) {
        seededSchedRef.current[dev.id] = schedSig;
        setDeviceSchedule(
          dev.id,
          state.timers.map((tm) => ({
            slot: tm.slot,
            enable: tm.enable,
            days: (tm.days ?? ALL) as DeviceScheduleSlot['days'],
            startTime: (tm.startTime ?? '00:00:00').slice(0, 5),
            endTime: (tm.endTime ?? '00:00:00').slice(0, 5),
          })),
        );
      }
    }
  }, [channelStates, setDeviceThreshold, setDeviceSchedule]);

  /*
   * ตัวแก้ที่ **ผู้ใช้** เป็นคนสั่ง — ทำเครื่องหมาย dirty ก่อนเสมอ เพื่อให้ effect ข้างบนหยุดเติมทับ
   * (effect ใช้ setter ดิบ ตัวการ์ดใช้สองตัวนี้) แยกกันชัดเจน จะได้ไม่มีใครเผลอสลับ
   */
  const setThresholdByUser = useCallback(
    (id: DeviceId, patch: Partial<FanTempThreshold>) => {
      dirtyRef.current.add(id);
      setDeviceThreshold(id, patch);
    },
    [setDeviceThreshold],
  );
  const setScheduleByUser = useCallback(
    (id: DeviceId, slots: readonly DeviceScheduleSlot[]) => {
      dirtyRef.current.add(id);
      setDeviceSchedule(id, slots);
    },
    [setDeviceSchedule],
  );

  /** ป้าย "อัปเดต … ที่แล้ว" รีเซ็ตตามค่าจริงล่าสุด (โชว์เฉพาะตอน live) */
  const secs = useElapsedSeconds(live.updatedAt);
  const confirm = useConfirm();
  /**
   * ใช้ห่วงโซ่ความปลอดภัยกลางตัวเดียวกับฉากเกมและหน้าชลประทาน
   *
   * ของเดิมหน้านี้เขียน `runCommand`/`toggleDevice` ของตัวเอง แล้วเช็คแค่ G2 ตอนปิดพัดลมใบใหญ่
   * การ **เปิด** อุปกรณ์ไม่เคยเรียก `guard()` เลย → **เปิดปั๊มได้ทั้งที่ถังน้ำต่ำกว่าเกณฑ์ G1**
   * ขณะที่หน้าอื่นบล็อก กฎข้อเดียวกันจึงตัดสินคนละแบบตามหน้าที่เปิดอยู่
   */
  const command = useDeviceCommand({ t, temp: climate.temp, confirm, flash });
  const on = useMemo(
    () => Object.fromEntries(devices.map((d) => [d.id, d.on])) as Record<DeviceId, boolean>,
    [devices],
  );
  /** ออนไลน์/ออฟไลน์ก็มาจากส่วนกลาง — `GH_DEVICES.offline` เป็นแค่ค่าเริ่มต้นเดิมของหน้านี้ */
  // โหมดจริงที่อุปกรณ์ค้าง/ถูกระงับ = ใช้ไม่ได้ทั้งเครื่อง → ปุ่มทุกตัว disable + ขึ้น "ออฟไลน์"
  // (ไม่ใช่แค่ flash ตอนกด — ทีม backend ย้ำ: กดตอนอุปกรณ์ดับจะได้ ok:true หลอกว่าสำเร็จ)
  const deviceUnusable = realControl && (deviceStale || deviceBanned);
  const offlineOf = (id: DeviceId): boolean =>
    deviceUnusable || !(devices.find((d) => d.id === id)?.online ?? true);
  // สถานะ pending ('on'/'off'/null) ของแต่ละอุปกรณ์อ่านจาก `Device.pending` ส่วนกลาง
  // ส่งตรงเข้า DeviceControlCard เพื่อให้ลูกบิดเลื่อนแบบ optimistic + โชว์ "รอยืนยัน"

  // guard: พัดลมใบใหญ่ทำงานพร้อมกันทั้งสองตัว = กินไฟเกินจำเป็น
  const conflict = on.big1 && on.big2 && !emergency;
  const guardMsg = emergency ? t.guardEmerg : conflict ? t.guardConflict : null;
  /**
   * ปิดระบบความชื้นแล้วจะยังมีพัดลมใหญ่เดินอยู่ไหม — ตัวที่ระบบความชื้น "ไม่ได้คุม" จะไม่ถูกสั่งดับ
   * ใช้เป็นอินพุตของ G2 (`bigFanOffBlocked`) แทนการเดาเอาเองในตัวแบนเนอร์
   */
  const bigFanStillRunningAfter = (['big1', 'big2'] as const).some(
    (id) => on[id] && !ventOwned.includes(id),
  );
  /**
   * ใครสั่งพัดลมตัวนี้อยู่ — ระบบความชื้นคุม (`system`) หรือผู้ใช้แย่งไว้แล้ว (`manual`)
   * โชว์เฉพาะตอนรอบดูดกำลังทำงาน ไม่งั้นป้ายจะขึ้นตลอดจนกลายเป็นเสียงรบกวน
   */
  const ventRoleOf = (id: DeviceId): 'system' | 'manual' | null => {
    // ปั๊มคูลลิ่งแพดเดินตามพัดลมใหญ่เสมอ — ป้ายขึ้นเฉพาะตอนผู้ใช้แย่งคุมไว้ (เช่นเปิดล้างแผง)
    if (id === 'pump') return pumpManual ? 'manual' : null;
    if (humidityVentStage === 0 || (id !== 'big1' && id !== 'big2')) return null;
    return ventOwned.includes(id) ? 'system' : 'manual';
  };

  const climateCards = ghClimateCards(climate);
  const climateWarn = climateCards.some((c) => c.warn);
  /*
   * ติดป้ายที่มาของค่าเฉพาะตอน "จริงบางส่วน" — เหตุผลเดียวกับการ์ดบนแดชบอร์ด
   * ยังไม่ต่ออะไรเลยก็ไม่ต้องแปะ "จำลอง" ทุกใบ เพราะป้ายบน header บอกไว้แล้ว
   */
  const showSource = live.fields.size > 0;
  const sourceOf = (key: LiveField): SensorSource =>
    !live.fields.has(key) ? 'sim' : live.stale.has(key) ? 'stale' : 'live';

  return (
    <>
      <DataPage
        title={t.ghTitle}
        subtitle={t.farmName}
        secondsSinceRead={secs}
        onSoon={() => flash(t.soonToast)}
        onFlash={flash}
      >
        {/* สภาพอากาศในโรงเรือน */}
        <section className={`${g.glass} ${g.lift} ${g.section}`} aria-label={t.statusTitle}>
          <div className={s.climateHead}>
            <h2 className={g.h2}>{t.statusTitle}</h2>
            <span
              className={s.climateTag}
              style={{
                color: climateWarn ? 'var(--d-warn-ink-2)' : 'var(--d-ok-ink)',
                background: climateWarn ? 'var(--d-warn-bg)' : 'var(--d-ok-bg)',
              }}
            >
              {climateWarn ? t.climateWarn : t.climateOk}
            </span>
            <span className={g.sub} style={{ marginLeft: 'auto' }}>
              {t.statusSub}
            </span>
          </div>
          {/* อุปกรณ์ออฟไลน์/ถูกระงับ → หรี่ค่าเซนเซอร์ (ค่าที่เห็นไม่ใช่ของสด · ทีม backend สั่ง) */}
          <div className={s.climateGrid} style={deviceUnusable ? { opacity: 0.5 } : undefined}>
            {climateCards.map((c) => (
              <div
                key={c.labelKey}
                className={s.climateCard}
                style={c.warn ? { borderColor: 'var(--d-warn)' } : undefined}
              >
                <div className={s.climateTop}>
                  <RingGauge percent={c.ratio * 100} color={c.color} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className={s.climateLabelRow}>
                      <span className={s.climateLabel}>{t[c.labelKey]}</span>
                      {showSource ? (
                        <span
                          className={[d.senSrc, srcClass(sourceOf(c.key))].join(' ')}
                          title={srcHint(sourceOf(c.key), t)}
                        >
                          {srcLabel(sourceOf(c.key), t)}
                        </span>
                      ) : null}
                      <span
                        className={s.climateDot}
                        aria-hidden="true"
                        style={{
                          background: c.warn ? 'var(--d-warn)' : 'var(--d-ok)',
                          boxShadow: `0 0 0 3px ${c.warn ? 'var(--d-warn-bg)' : 'var(--d-ok-bg)'}`,
                          ...(c.warn && !reduced
                            ? { animation: 'sy-pulse 2s ease-in-out infinite' }
                            : {}),
                        }}
                      />
                    </div>
                    <div className={s.climateValueRow}>
                      <span className={`${s.climateValue} ${g.num}`}>{c.value}</span>
                      <span className={s.climateUnit}>{c.unit}</span>
                    </div>
                  </div>
                </div>
                <div className={s.climateNote}>{t[c.noteKey]}</div>
              </div>
            ))}
          </div>
        </section>

        {/* อุปกรณ์ 4 ตัว — การ์ดเหลือสวิตช์เปิด/ปิด + ปุ่มอัตโนมัติ (เงื่อนไขไปตั้งด้านล่าง) */}
        <div>
          <div className={d.sectionHead}>
            <h2 className={g.h2}>{t.devicesTitle}</h2>
            <span className={g.sub}>{t.devicesSub}</span>
            {/* ผลตอบกลับคำสั่งล่าสุด — โผล่เฉพาะตอนต่อจริงและมีข้อมูล */}
            <span style={{ marginLeft: 'auto' }}>
              <CommandChannel />
            </span>
          </div>
          <div className={s.deviceGrid}>
            {GH_DEVICES.map((dev) => {
              const channel = channelOf(dev.id);
              return (
                <DeviceControlCard
                  key={dev.id}
                  dev={dev}
                  isOn={on[dev.id]}
                  pending={devices.find((dv) => dv.id === dev.id)?.pending ?? null}
                  offline={offlineOf(dev.id)}
                  emergency={emergency}
                  realControl={realControl}
                  channel={channel}
                  channelState={channel !== null ? channelStates?.[channel] : undefined}
                  mode={mode[dev.id]}
                  deviceStale={deviceStale}
                  ventRole={ventRoleOf(dev.id)}
                  cutoffLeft={dev.id === 'pump' ? cutoffLeft : null}
                  t={t}
                  reduced={reduced}
                  onPress={command.press}
                  onToggleMode={setMode}
                />
              );
            })}
          </div>
        </div>

        {/* แถบเตือน guard (พัดลมใหญ่ชนกัน / หยุดฉุกเฉิน) — เป็นข้อมูล ไม่ใช่ปุ่ม จึงคงไว้
            (การ์ด "ความปลอดภัยของระบบ" + "ประวัติการสั่งงาน" ถอดออกตามที่เจ้าของงานสั่ง) */}
        {guardMsg ? (
          <div className={`${s.guardBox} ${g.section}`} role="alert">
            <Icon name="alert" size={18} color="#9a5e0c" strokeWidth={2} />
            <span className={s.guardText}>{guardMsg}</span>
          </div>
        ) : null}

        {/*
          🔴 กดหยุดฉุกเฉินแล้วอุปกรณ์ยังรายงานว่าทำงานอยู่ — ต้องเห็นก่อนอย่างอื่นและต้องต่างจากกล่องเตือนทั่วไป
          จังหวะนี้ผู้ใช้ต้องลุกไปตัดไฟหน้างาน ไม่ใช่รออยู่หน้าจอ
        */}
        <EstopDefiedAlert className={g.section} />

        {/* โหมดจริง + estop: บอกว่าแอปปิดเกณฑ์อัตโนมัติในอุปกรณ์ให้แล้ว และจะยังปิดอยู่หลังปลดล็อก */}
        {emergency && realControl ? (
          <div className={`${s.guardBox} ${g.section}`} role="alert">
            <Icon name="alert" size={18} color="var(--d-warn)" strokeWidth={2} />
            <span className={s.guardText}>{t.estopAutoWarn}</span>
          </div>
        ) : null}

        {/* ── เงื่อนไขอัตโนมัติ (single source · ฉากเกมลิงก์มาที่นี่) ── */}
        <section className={`${g.glass} ${g.section}`} id="gh-auto" aria-label={t.ghAutoTitle}>
          <div className={s.autoHead}>
            <div>
              <h2 className={g.h2}>{t.ghAutoTitle}</h2>
              <p className={g.sub} style={{ margin: '3px 0 0' }}>
                {t.ghAutoSub}
              </p>
            </div>
            <div className={s.notLiveNote} role="note">
              <Icon name="info" size={15} color="var(--d-muted)" strokeWidth={1.9} />
              <span>{t.rulesNotLiveNote}</span>
            </div>
          </div>

          {/* ── ควบคุมความชื้นด้วยพัดลมดูด (farm-wide) ── */}
          <HumidityBanner
            humidityAuto={humidityAuto}
            setHumidityAuto={setHumidityAuto}
            ventStage={humidityVentStage}
            rhReal={live.fields.has('rh')}
            rh={climate.rh}
            temp={climate.temp}
            bigFanStillRunningAfter={bigFanStillRunningAfter}
            emergency={emergency}
            onConfirmAsk={confirm.ask}
            t={t}
          />

          <div className={s.autoGrid}>
            {/*
              อุปกรณ์ที่ตั้งเงื่อนไขได้ = ทุกตัวที่มี relay ของตัวเอง
              พัดลมเล็กไม่อยู่ในนี้เพราะพ่วงสายกับใหญ่ #2 (ตั้งที่ใหญ่ #2 แล้วมันตามเอง)
              🔴 **ปั๊มไม่อยู่ในนี้** — มันคือปั๊มคูลลิ่งแพด ทำงานตามพัดลมใหญ่อย่างเดียว
              ไม่มีเกณฑ์เซนเซอร์และไม่มีตารางเวลาของตัวเอง (ดู DESIGN_SOURCE ข้อ 37)
            */}
            {GH_DEVICES.filter((dev) => bondedTo(dev.id) === null && dev.id !== 'pump').map(
              (dev) => {
                const channel = channelOf(dev.id);
                return (
                  <DeviceConditionCard
                    key={dev.id}
                    dev={dev}
                    name={deviceLabel(dev.id, dev.nameKey, t)}
                    th={deviceThresholds[dev.id]}
                    slots={deviceSchedules[dev.id] ?? []}
                    channel={channel}
                    chState={channel !== null ? channelStates?.[channel] : undefined}
                    realControl={realControl}
                    offline={offlineOf(dev.id)}
                    emergency={emergency}
                    t={t}
                    onSetThreshold={setThresholdByUser}
                    onSendThreshold={command.sendThreshold}
                    onDisableTempAuto={command.disableTempAuto}
                    onSetSchedule={setScheduleByUser}
                    onScheduleToggle={command.sendScheduleToggle}
                    onScheduleSave={command.sendScheduleSave}
                    onScheduleDelete={command.sendScheduleDelete}
                    onConfirmAsk={confirm.ask}
                  />
                );
              },
            )}
          </div>
        </section>
      </DataPage>

      <CommandConfirm
        request={confirm.request}
        onCancel={confirm.cancel}
        onAccept={confirm.accept}
      />

      <Toast message={toast} />
    </>
  );
}
