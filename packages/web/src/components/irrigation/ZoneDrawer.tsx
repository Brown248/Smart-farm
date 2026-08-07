import { useState } from 'react';
import { Sparkline } from '@/components/charts/Sparkline';
import { CommandLog } from '@/components/common/CommandLog';
import { Icon } from '@/components/common/Icon';
import type { LogEntry } from '@/data/devices';
import {
  DRAWER_SENSORS,
  DRAWER_TABS,
  DRAWER_TAB_LABEL,
  IRR_BG,
  IRR_COLOR,
  MODE_COLOR,
  MODE_LABEL,
  TARGET_MOISTURE,
  TIMELINE_META,
  ZONE_HISTORY,
} from '@/data/irrigation';
import type { DrawerTab, IrrStatus, IrrZone, WateringMode } from '@/data/irrigation';
import { NOTIF_TOGGLE_KEYS, NOTIF_TOGGLE_LABEL } from '@/data/irrigation';
import type { NotifToggleKey } from '@/data/irrigation';
import { useI18n } from '@/i18n/useI18n';
import type { TextKey } from '@/i18n/keys';
import g from '@/styles/dashboard.module.css';
import s from './ZoneDrawer.module.css';

export interface ZoneSettings {
  readonly name: string;
  readonly crop: string;
  readonly area: string;
  readonly target: string;
}

export interface ZoneDrawerProps {
  readonly zone: IrrZone;
  readonly tab: DrawerTab;
  readonly onTab: (tab: DrawerTab) => void;
  readonly onClose: () => void;

  /** ทั้งโรงเรือนกำลังโดนน้ำอยู่ไหม — ไม่ใช่สถานะเฉพาะแปลงนี้ */
  readonly watering: boolean;
  /** กลยุทธ์รดน้ำของทั้งฟาร์ม (ตั้งที่ส่วน "อัตโนมัติ" บนหน้าชลประทาน) */
  readonly strategy: WateringMode;

  /** control log ส่วนกลาง — ไม่ใช่ log ของหน้าใดหน้าหนึ่ง */
  readonly cmdLog: readonly LogEntry[];

  /** ค่าที่บันทึกแล้วของโซนนี้ (แสดงเป็นชื่อบนหัว/แผนที่) — ช่องกรอกใช้ draft ในตัว */
  readonly settings: ZoneSettings;
  readonly notif: Readonly<Record<NotifToggleKey, boolean>>;
  readonly onNotif: (key: NotifToggleKey) => void;
  readonly settingsSaved: boolean;
  /** กด "บันทึก" ค่อย commit draft → ค่าที่บันทึก (Save ≠ พิมพ์ทุกครั้ง) */
  readonly onSaveSettings: (next: ZoneSettings) => void;
}

/** ต่างจากค่าที่บันทึกไว้ไหม — ใช้ตัดสินว่ามีการแก้ที่ยังไม่ได้บันทึก */
function isDirty(a: ZoneSettings, b: ZoneSettings): boolean {
  return a.name !== b.name || a.crop !== b.crop || a.area !== b.area || a.target !== b.target;
}

/** ลิ้นชักข้อมูลรายแปลง 4 แท็บ — คำสั่งรดน้ำเป็นของทั้งฟาร์ม จึงไม่อยู่ในนี้แล้ว */
export function ZoneDrawer(p: ZoneDrawerProps) {
  const { t } = useI18n();
  const z = p.zone;
  // ปั๊มเดิน = ทุกแปลงกำลังโดนน้ำ สถานะที่โชว์จึงทับสภาพดินไว้ชั่วคราว
  const shown: IrrStatus = p.watering ? 'watering' : z.status;
  const color = IRR_COLOR[shown];
  const bg = IRR_BG[shown];
  // ชื่อที่แสดง = ชื่อที่ผู้ใช้ตั้งไว้ (บันทึกแล้ว) ถ้ามี ไม่งั้นใช้ "โซน X"
  const name = p.settings.name.trim() || t.zoneLetterPrefix + z.letter;

  // draft ของแท็บตั้งค่า — พิมพ์ลง draft, กด "บันทึก" ค่อย commit (Save จึงมีผลจริง)
  const [draft, setDraft] = useState<ZoneSettings>(p.settings);
  const dirty = isDirty(draft, p.settings);

  const statusLabelKey: Readonly<Record<IrrStatus, TextKey>> = {
    watering: 'lgWatering',
    normal: 'lgNormal',
    warn: 'lgWatch',
    dry: 'lgDry',
  };

  return (
    <div className={s.overlay}>
      <button
        type="button"
        className={s.scrim}
        aria-label={t.close}
        tabIndex={-1}
        onClick={p.onClose}
      />
      <div className={s.panel} role="dialog" aria-modal="true" aria-label={name}>
        <div className={s.head}>
          <div className={s.headRow}>
            <span className={s.headIcon} style={{ background: bg }} aria-hidden="true">
              <Icon name="soil" size={22} color={color} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={s.headTitleRow}>
                <h2 className={s.headTitle}>{name}</h2>
                <span className={s.statusBadge} style={{ color, background: bg }}>
                  {t[statusLabelKey[shown]]}
                </span>
              </div>
              <div className={s.headSub}>
                {t[z.cropKey]} · {t.areaUnit(z.area)}
              </div>
            </div>
            <button type="button" className={s.close} aria-label={t.close} onClick={p.onClose}>
              <Icon name="close" size={17} strokeWidth={2} />
            </button>
          </div>

          <div className={`${s.tabs} ${g.hscroll}`} role="tablist" aria-label={name}>
            {DRAWER_TABS.map((tb) => (
              <button
                key={tb}
                type="button"
                role="tab"
                aria-selected={p.tab === tb}
                className={[s.tab, p.tab === tb ? s.tabOn : null].filter(Boolean).join(' ')}
                onClick={() => p.onTab(tb)}
              >
                {t[DRAWER_TAB_LABEL[tb]]}
              </button>
            ))}
          </div>
        </div>

        <div className={s.body}>
          {/* ── ภาพรวม ── */}
          {p.tab === 'overview' ? (
            <div className={s.stack}>
              <div className={`${s.card} ${s.cardLg}`}>
                <div className={s.label}>{t.ovMoist}</div>
                <div className={s.moistRow}>
                  <span className={`${s.moistValue} ${g.num}`} style={{ color }}>
                    {z.moisture}%
                  </span>
                  <span className={s.moistTarget}>
                    {t.ovTarget} {TARGET_MOISTURE}%
                  </span>
                </div>
                <div className={s.moistTrack}>
                  <div
                    className={s.moistFill}
                    style={{ width: Math.min(100, z.moisture) + '%', background: color }}
                  />
                  <div className={s.moistTick} style={{ left: TARGET_MOISTURE + '%' }} />
                </div>
              </div>
              {/* 4 การ์ดสถิติ — ต้องมี grid ไม่งั้นขอบการ์ดชนกันเป็นพืด */}
              <div className={s.statGrid}>
                <div className={s.card}>
                  {/* โหมดเป็นของทั้งฟาร์ม — ไม่มีตัวควบคุมรายแปลงให้ตั้งคนละโหมด */}
                  <div className={s.labelSm}>{t.ovMode}</div>
                  <div className={s.statMode}>
                    <span className={s.modeDot} style={{ background: MODE_COLOR[p.strategy] }} />
                    <span className={s.modeText}>{t[MODE_LABEL[p.strategy]]}</span>
                  </div>
                </div>
                <div className={s.card}>
                  <div className={s.labelSm}>{t.ovState}</div>
                  <div
                    className={s.modeText}
                    style={{
                      marginTop: 6,
                      color: p.watering ? 'var(--d-m-hum)' : 'var(--d-muted)',
                    }}
                  >
                    {p.watering ? t.watering : t.idle}
                  </div>
                </div>
                {/* ไม่มีมิเตอร์วัดการไหล → empty state แทนตัวเลขลิตรปลอม (เดิม 320/1,850 ล.) */}
                <div className={s.card}>
                  <div className={s.labelSm}>{t.ovToday}</div>
                  <div className={`${s.statBig} ${g.num}`} style={{ color: 'var(--d-muted)' }}>
                    —
                  </div>
                  <div className={s.labelSm}>{t.ovNoMeter}</div>
                </div>
                <div className={s.card}>
                  <div className={s.labelSm}>{t.ovWeek}</div>
                  <div className={`${s.statBig} ${g.num}`} style={{ color: 'var(--d-muted)' }}>
                    —
                  </div>
                  <div className={s.labelSm}>{t.ovNoMeter}</div>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── เซนเซอร์ ── */}
          {p.tab === 'sensors' ? (
            <div className={s.stack}>
              {DRAWER_SENSORS.map((ds) => (
                <div key={ds.labelKey} className={s.sensorRow}>
                  <span className={s.sensorIcon} style={{ background: ds.bg }} aria-hidden="true">
                    <Icon name={ds.icon} size={17} color={ds.color} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={s.sensorTop}>
                      <span className={s.sensorLabel}>{t[ds.labelKey]}</span>
                      {/*
                        จุดสถานะ: ดิน (value===null → ใช้ค่าจริง/ที่ derive ของแปลง) = จุดเขียว "สด"
                        อุณหภูมิ/ความชื้นยังเป็นค่าตัวอย่างระดับฟาร์ม = จุดเทา ไม่แอบอ้างว่าสด
                        (เดิมกลับด้าน: ค่าจริงได้จุดส้ม ค่าปลอมได้จุดเขียว)
                      */}
                      <span
                        className={s.sensorDot}
                        aria-hidden="true"
                        style={{
                          background: ds.value === null ? 'var(--d-ok)' : 'var(--d-muted)',
                          boxShadow: `0 0 0 3px ${ds.value === null ? 'var(--d-ok-bg)' : 'var(--d-line-2)'}`,
                        }}
                      />
                    </div>
                    <div className={s.sensorValueRow}>
                      <span className={`${s.sensorValue} ${g.num}`}>{ds.value ?? z.moisture}</span>
                      <span className={s.sensorUnit}>{ds.unit}</span>
                    </div>
                  </div>
                  <div className={s.sensorSpark}>
                    <Sparkline color={ds.color} data={ds.data} animate={false} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* ── ประวัติ ── */}
          {p.tab === 'history' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={s.card}>
                <div className={s.ruleGroupHead}>
                  <Icon name="check" size={16} color="var(--brand-green)" strokeWidth={1.9} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--d-ink)' }}>
                    {t.ctrlLogTitle}
                  </span>
                </div>
                {/* ประวัติชุดเดียวกับหน้าควบคุมโรงเรือน — สั่งที่ไหนก็เห็นตรงกัน */}
                <CommandLog entries={p.cmdLog} />
              </div>

              {/* ป้ายบอกชัดว่าเป็นตัวอย่าง — ไม่ให้ปนกับ control log จริงด้านบน */}
              <div className={s.ruleGroupHead} style={{ padding: '0 2px' }}>
                <Icon name="info" size={14} color="var(--d-muted)" strokeWidth={1.9} />
                <span style={{ fontSize: 13, color: 'var(--d-muted)' }}>{t.histSampleNote}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {ZONE_HISTORY.map((h) => {
                  const meta = TIMELINE_META[h.mode];
                  return (
                    <div key={h.timeKey} className={s.timelineRow}>
                      <div className={s.timelineRail}>
                        <span
                          className={s.timelineDot}
                          style={{ background: meta.color, borderColor: meta.bg }}
                        />
                        <span className={s.timelineLine} aria-hidden="true" />
                      </div>
                      <div className={s.timelineBody}>
                        <div className={s.timelineTop}>
                          <span
                            className={s.timelineTag}
                            style={{ color: meta.color, background: meta.bg }}
                          >
                            {t[meta.labelKey]}
                          </span>
                          <span style={{ fontSize: 13, color: 'var(--d-muted)' }}>
                            {t[h.timeKey]}
                          </span>
                        </div>
                        <div className={s.timelineTitle}>{t[h.titleKey]}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ── ตั้งค่า ── */}
          {p.tab === 'settings' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {(
                [
                  ['name', t.setName, 'text'],
                  ['crop', t.setCrop, 'text'],
                  ['area', t.setArea, 'text'],
                  ['target', t.setTarget, 'text'],
                ] as const
              ).map(([key, label, type]) => (
                <div key={key} className={s.settingRow}>
                  <label className={s.settingLabel} htmlFor={`set-${key}-${z.letter}`}>
                    {label}
                  </label>
                  <input
                    id={`set-${key}-${z.letter}`}
                    className={s.settingInput}
                    type={type}
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  />
                </div>
              ))}

              <div className={s.card} style={{ marginTop: 3 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: 'var(--d-ink-2)',
                    marginBottom: 11,
                  }}
                >
                  {t.setNotif}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {NOTIF_TOGGLE_KEYS.map((k) => (
                    <div key={k} className={s.notifRow}>
                      <span className={s.notifLabel}>{t[NOTIF_TOGGLE_LABEL[k]]}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={p.notif[k]}
                        aria-label={t[NOTIF_TOGGLE_LABEL[k]]}
                        className={[s.toggle, p.notif[k] ? s.toggleOn : null]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => p.onNotif(k)}
                      >
                        <span
                          className={[s.toggleKnob, p.notif[k] ? s.toggleKnobOn : null]
                            .filter(Boolean)
                            .join(' ')}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* ป้าย "ยังไม่ได้บันทึก" ตอนแก้ค้าง · "บันทึกแล้ว" เมื่อ commit และไม่มีแก้ค้าง */}
              {dirty ? (
                <div className={s.unsavedMsg} role="status">
                  <Icon name="info" size={15} strokeWidth={2} />
                  {t.settingsUnsaved}
                </div>
              ) : p.settingsSaved ? (
                <div className={s.savedMsg} role="status">
                  <Icon name="tick" size={15} strokeWidth={2.2} />
                  {t.settingsSavedMsg}
                </div>
              ) : null}

              <button
                type="button"
                className={s.saveBtn}
                disabled={!dirty}
                onClick={() => p.onSaveSettings(draft)}
              >
                {t.saveSettings}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
