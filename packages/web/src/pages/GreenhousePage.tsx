import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { DeviceId } from '@shared/device';
import type { HsChannel } from '@shared/handysense';
import { Toast } from '@/components/common';
import { RingGauge } from '@/components/charts/RingGauge';
import { CommandChannel } from '@/components/common/CommandChannel';
import { CommandConfirm } from '@/components/common/CommandConfirm';
import { Icon } from '@/components/common/Icon';
import { NumberField } from '@/components/common/NumberField';
import { DataPage } from '@/components/layout/DataPage';
import { HS_DAY_KEYS } from '@shared/handysense';
import { BIG_FAN_LOCK_TEMP } from '@shared/thresholds';
import {
  GH_DEVICES,
  GH_DEVICE_NUMBER,
  MAX_SCHEDULE_SLOTS,
  ghClimateCards,
} from '@/data/greenhouse';
import type { DeviceScheduleSlot, FanTempThreshold, GhDevice, GhMode } from '@/data/greenhouse';
import type { HsChannelState } from '@/config/deviceAttributes';
import { bondedTo, channelOf } from '@/config/deviceChannels';
import { useConfirm } from '@/hooks/useConfirm';
import { useDeviceCommand } from '@/hooks/useDeviceCommand';
import { useElapsedSeconds } from '@/hooks/useDashboardData';
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
      </div>

      {/* ป้ายสถานะ: พ่วงตัวหลัก / ยังไม่ต่อ relay / automation ที่อาจทับการกดปุ่ม */}
      {master ? (
        <div className={s.notLiveNote} role="note">
          <Icon name="info" size={14} color="var(--d-muted)" strokeWidth={1.9} />
          <span>{t.ghBondedFollows(masterName)}</span>
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
interface FanConditionCardProps {
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

const FanConditionCard = memo(function FanConditionCard({
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
}: FanConditionCardProps) {
  const [tab, setTab] = useState<'temp' | 'sched'>('temp');

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

      {/* สลับ อุณหภูมิ / ตารางเวลา — โชว์ทีละอัน ตารางเวลาไม่โผล่รกจนกว่าจะกดแท็บ */}
      <div className={s.segRow}>
        <button
          type="button"
          aria-pressed={tab === 'temp'}
          aria-label={`${name} · ${t.ghTabTemp}`}
          className={[s.segTab, tab === 'temp' ? s.segTabOn : null].filter(Boolean).join(' ')}
          onClick={() => setTab('temp')}
        >
          <Icon name="temp" size={14} color="var(--d-m-temp)" strokeWidth={1.9} />
          {t.ghTabTemp}
        </button>
        <button
          type="button"
          aria-pressed={tab === 'sched'}
          aria-label={`${name} · ${t.ghSchedTitle}`}
          className={[s.segTab, tab === 'sched' ? s.segTabOn : null].filter(Boolean).join(' ')}
          onClick={() => setTab('sched')}
        >
          <Icon name="clock" size={14} color="var(--d-warn)" strokeWidth={1.9} />
          {t.ghSchedTitle}
        </button>
      </div>

      {tab === 'temp' ? (
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
              <div key={i} className={s.slotCard}>
                <div className={s.slotHead}>
                  <span className={s.slotName}>{t.ghSchedSlot(slot.slot + 1)}</span>
                  <button
                    type="button"
                    className={s.schedRemove}
                    aria-label={`${name} · ${t.ghSchedDelSlot} ${i + 1}`}
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
  emergency,
  onConfirmAsk,
  t,
}: HumidityBannerProps) {
  const validRange = humidityAuto.onAt > humidityAuto.offAt;
  const stageLabel =
    ventStage === 2 ? t.humStatusVent2 : ventStage === 1 ? t.humStatusVent1 : t.humStatusOff;
  // ปิดสวิตช์ = สั่งดับพัดลมจริง (เหมือนปุ่มออโต้พัดลม) · ถ้ากำลังดูดอยู่ + ร้อน >33°C =
  // จะดับพัดลมใหญ่ตัวสุดท้ายขณะร้อน → เตือน+ยืนยัน (reuse ข้อความ G2 ชุดเดียวกับ press/disableTempAuto)
  const toggleHum = () => {
    if (humidityAuto.enabled && ventStage >= 1 && temp > BIG_FAN_LOCK_TEMP) {
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
  } = useFarmState();

  /**
   * โหมดจริง: seed ตัวแก้ (เกณฑ์อุณหภูมิ + ตารางเวลา) จาก **อุปกรณ์จริง** ครั้งเดียวเมื่อค่ามาแล้ว
   * ไม่งั้นตัวแก้จะโชว์ค่า default ปลอม แล้วกด "บันทึก/ส่ง" ไปทับค่าจริงของอุปกรณ์ (ตั้ง automation ที่ไม่ได้ตั้งใจ)
   * seed ครั้งเดียวต่ออุปกรณ์ (seededRef) เพื่อไม่ทับสิ่งที่ผู้ใช้กำลังแก้
   */
  const seededRef = useRef<Set<DeviceId>>(new Set());
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
      if (ch === null || seededRef.current.has(dev.id)) continue;
      const state = channelStates[ch];
      // seed เฉพาะเมื่อ "ช่องนั้น" มีค่าจริงของตัวเองแล้ว (led{ch} มาแล้ว) — ไม่ผูกกับ led0 ตัวเดียว
      // ไม่งั้นช่องที่ค่ามาช้ากว่าจะถูก seed เป็น default แล้วล็อก (seededRef) ไม่รับค่าจริงอีก (Finding 5)
      if (!state || state.on === null) continue;
      seededRef.current.add(dev.id);
      // เกณฑ์อุณหภูมิจริง — ถ้าอุปกรณ์ไม่มีเกณฑ์ (0,0) โชว์ "ปิด" ไม่ใช่ default ปลอม
      const temp = state?.temp;
      setDeviceThreshold(
        dev.id,
        temp?.on
          ? { enabled: true, min: temp.min ?? 30, max: temp.max ?? 35 }
          : { enabled: false, min: 30, max: 35 },
      );
      // ตารางเวลาจริง
      const timers = state?.timers ?? [];
      setDeviceSchedule(
        dev.id,
        timers.map((tm) => ({
          slot: tm.slot,
          enable: tm.enable,
          days: (tm.days ?? ALL) as DeviceScheduleSlot['days'],
          startTime: (tm.startTime ?? '00:00:00').slice(0, 5),
          endTime: (tm.endTime ?? '00:00:00').slice(0, 5),
        })),
      );
    }
  }, [channelStates, setDeviceThreshold, setDeviceSchedule]);
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

  const climateCards = ghClimateCards(climate);
  const climateWarn = climateCards.some((c) => c.warn);
  /*
   * ติดป้ายที่มาของค่าเฉพาะตอน "จริงบางส่วน" — เหตุผลเดียวกับการ์ดบนแดชบอร์ด
   * ยังไม่ต่ออะไรเลยก็ไม่ต้องแปะ "จำลอง" ทุกใบ เพราะป้ายบน header บอกไว้แล้ว
   */
  const showSource = live.fields.size > 0;

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
                          className={[
                            d.senSrc,
                            live.fields.has(c.key) ? d.senSrcLive : d.senSrcSim,
                          ].join(' ')}
                          title={live.fields.has(c.key) ? t.liveTag : t.simTagHint}
                        >
                          {live.fields.has(c.key) ? t.liveTag : t.simTag}
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

        {/* โหมดจริง + estop: เตือนว่า OR-logic ของฮาร์ดแวร์อาจเปิดอุปกรณ์กลับ (ผู้ใช้ต้องรู้ ไม่ใช่แค่โค้ด) */}
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
            emergency={emergency}
            onConfirmAsk={confirm.ask}
            t={t}
          />

          <div className={s.autoGrid}>
            {/* เกณฑ์อุณหภูมิ = เฉพาะพัดลมใหญ่ (big1/big2) · พัดลมเล็กพ่วงใหญ่#2 (ตั้งที่ใหญ่#2) · ปั๊มไม่ใช้เกณฑ์อุณหภูมิ */}
            {GH_DEVICES.filter((dev) => dev.id !== 'pump' && bondedTo(dev.id) === null).map(
              (dev) => {
                const channel = channelOf(dev.id);
                return (
                  <FanConditionCard
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
                    onSetThreshold={setDeviceThreshold}
                    onSendThreshold={command.sendThreshold}
                    onDisableTempAuto={command.disableTempAuto}
                    onSetSchedule={setDeviceSchedule}
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
