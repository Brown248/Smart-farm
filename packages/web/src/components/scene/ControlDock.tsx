import type { DeviceId } from '@shared/device';
import { Button, Modal, StatusDot } from '@/components/common';
import { useI18n } from '@/i18n/useI18n';
import { deviceView } from '@/lib/deviceView';
import { isBonded } from '@/config/deviceChannels';
import { STATUS_COLOR } from '@/lib/status';
import type { DeviceCommandApi } from '@/hooks/useDeviceCommand';
import s from './ControlDock.module.css';

export interface ControlDockProps {
  readonly command: DeviceCommandApi;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onOpenAdvanced: () => void;
  readonly reduced: boolean;
}

/**
 * ปุ่มลอย 2 ปุ่ม + ลิ้นชักควบคุมอุปกรณ์ 5 ตัว
 *
 * Emergency Stop กดครั้งเดียวติดทันที ไม่มีหน้าต่างยืนยัน (ตั้งใจให้เร็วที่สุด)
 * ส่วนการ "ปลดล็อก" ต้องยืนยันก่อน — ตรรกะอยู่ใน useDeviceCommand
 */
export function ControlDock({
  command,
  open,
  onOpen,
  onClose,
  onOpenAdvanced,
  reduced,
}: ControlDockProps) {
  const { t } = useI18n();
  const { devices, estop, tank, justDone, busy } = command;

  const onCount = devices.filter((d) => d.on).length;
  const offlineCount = devices.filter((d) => !d.online).length;

  const estopBackground = estop
    ? 'linear-gradient(180deg, #45996a, #2b6746)'
    : 'linear-gradient(180deg, #e0574b, #bf3b31)';

  const fabDotColor = estop
    ? STATUS_COLOR.critical
    : busy
      ? STATUS_COLOR.low
      : onCount
        ? STATUS_COLOR.ok
        : '#cfd6c6';

  return (
    <>
      <div className={s.fabs}>
        <Button
          className={s.estopFab}
          onClick={command.estopPress}
          style={{
            background: estopBackground,
            borderColor: estop ? 'var(--brand-green-dark)' : '#8d281f',
            ...(estop || reduced ? {} : { animation: 'fsEPulse 3s ease-in-out infinite' }),
          }}
        >
          {estop ? t.unlockFab : t.estopFab}
        </Button>

        <Button className={s.controlsFab} onClick={onOpen}>
          <span className={s.fabDot} aria-hidden="true" style={{ background: fabDotColor }} />
          <span>{t.controlsFab}</span>
        </Button>
      </div>

      <Modal
        open={open}
        variant="drawer"
        title={t.panelTitle}
        closeLabel={t.close}
        onClose={onClose}
        zIndex={70}
      >
        <div className={s.summary}>{t.summary(onCount, devices.length, offlineCount, tank)}</div>

        {devices.map((d, i) => {
          const v = deviceView(d, {
            t,
            estop,
            justDone: justDone[d.id] === true,
            index: i,
            realControl: command.realControl,
            bonded: isBonded(d.id),
          });
          return (
            <div
              key={d.id}
              className={s.deviceCard}
              style={{
                borderColor: v.borderColor,
                background: v.cardBackground,
                ...(reduced ? {} : { animation: `fsRowIn .4s ease-out ${v.rowDelay} backwards` }),
              }}
            >
              <div className={s.deviceHead}>
                <StatusDot
                  color={v.statusColor}
                  animation={v.dotAnimation}
                  style={{ marginTop: 6 }}
                />
                <div className={s.deviceText}>
                  <span className={s.deviceName}>{v.name}</span>
                  <span className={s.deviceStatus} style={{ color: v.statusTextColor }}>
                    {v.statusText}
                  </span>
                </div>
              </div>

              <div className={s.deviceActions}>
                <Button
                  className={s.powerBtn}
                  disabled={v.disabled}
                  pending={v.pending}
                  onClick={() => command.press(d.id as DeviceId)}
                  style={{ background: v.buttonBackground, color: v.buttonColor }}
                >
                  {v.buttonLabel}
                </Button>
                <Button
                  className={s.modeBtn}
                  disabled={v.modeDisabled}
                  onClick={() => command.toggleAuto(d.id as DeviceId)}
                >
                  {v.modeLabel}
                </Button>
              </div>
            </div>
          );
        })}

        <Button
          className={s.estopFull}
          onClick={command.estopPress}
          style={{ background: estopBackground }}
        >
          {estop ? t.unlockFab : t.estopFull}
        </Button>
        <div className={s.hint}>{estop ? t.estopHintLocked : t.estopHint}</div>

        <Button variant="outline" className={s.advancedBtn} onClick={onOpenAdvanced}>
          {t.advanced}
        </Button>
      </Modal>
    </>
  );
}
