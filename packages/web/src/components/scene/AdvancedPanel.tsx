import { Button, Modal } from '@/components/common';
import { Icon } from '@/components/common/Icon';
import { useI18n } from '@/i18n/useI18n';
import type { LogEntry } from '@/data/devices';
import s from './AdvancedPanel.module.css';

export const ADV_TABS = ['cond', 'log', 'guard'] as const;
export type AdvTab = (typeof ADV_TABS)[number];

export interface AdvancedPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly tab: AdvTab;
  readonly onTab: (tab: AdvTab) => void;
  /** ไปหน้าควบคุมโรงเรือนส่วน "เงื่อนไขอัตโนมัติ" (single source — ไม่ทำ builder ซ้ำในฉากเกม) */
  readonly onGoToConditions: () => void;
  readonly log: readonly LogEntry[];
  /** จำนวนอุปกรณ์ที่ออฟไลน์จริงตอนนี้ — โชว์ในแท็บ guard (ไม่ฝังค่าคงที่) */
  readonly offlineCount: number;
  readonly reduced: boolean;
}

/**
 * ตั้งค่าขั้นสูง 3 แท็บ: เงื่อนไข AND/OR · control log · guard rules
 * ปุ่มเปิด/ปิดกติกาทำงานจริง (เขียน log) · ตัวเลขพารามิเตอร์แก้และเก็บค่าได้จริงในเครื่อง
 * แต่ยังไม่สั่งงานอุปกรณ์เองตามเงื่อนไข (รอต่อระบบจริง) — มีป้ายบอกไว้ในแท็บเงื่อนไข
 * guard rules เป็นข้อมูลอ่านอย่างเดียวโดยตั้งใจ — เป็นกฎความปลอดภัยที่ปิดไม่ได้
 */
export function AdvancedPanel({
  open,
  onClose,
  tab,
  onTab,
  onGoToConditions,
  log,
  offlineCount,
  reduced,
}: AdvancedPanelProps) {
  const { t } = useI18n();

  const rowAnimation = (i: number) =>
    reduced ? undefined : `fsRowIn .35s ease-out ${Math.min(i, 8) * 0.04}s backwards`;

  const tabs: readonly { key: AdvTab; label: string }[] = [
    { key: 'cond', label: t.tabCond },
    { key: 'log', label: t.tabLog },
    { key: 'guard', label: t.tabGuard },
  ];

  return (
    <Modal
      open={open}
      variant="wide"
      title={t.advanced}
      closeLabel={t.close}
      onClose={onClose}
      zIndex={76}
    >
      <div className={s.tabs}>
        {tabs.map((x) => (
          <Button
            key={x.key}
            pill
            onClick={() => onTab(x.key)}
            aria-pressed={tab === x.key}
            style={
              tab === x.key
                ? {
                    background: 'var(--brand-green)',
                    color: '#fff',
                    borderColor: 'var(--brand-green)',
                  }
                : undefined
            }
          >
            {x.label}
          </Button>
        ))}
      </div>

      {/* ตั้งเงื่อนไขอัตโนมัติที่หน้าควบคุมโรงเรือนที่เดียว (single source) — ไม่ทำ builder ซ้ำในฉากเกม */}
      {tab === 'cond' ? (
        <div className={s.condLink}>
          <div className={s.condLinkText}>
            <Icon name="gear" size={16} color="var(--brand-green)" strokeWidth={1.9} />
            <span>{t.condLinkNote}</span>
          </div>
          <Button
            className={s.condLinkBtn}
            onClick={onGoToConditions}
            style={{
              background: 'var(--brand-green)',
              color: '#fff',
              borderColor: 'var(--brand-green)',
            }}
          >
            {t.goToGhConditions}
            <Icon name="arrowRight" size={15} color="#fff" strokeWidth={2.1} />
          </Button>
        </div>
      ) : null}

      {tab === 'log'
        ? log.map((l, i) => (
            <div
              key={`${l.t}-${i}`}
              className={s.row}
              style={{
                background: 'var(--card-cream-1)',
                ...(rowAnimation(i) ? { animation: rowAnimation(i) } : {}),
              }}
            >
              <div className={s.rowText}>
                <span className={s.title}>{l.text ?? (l.key ? t[l.key] : '')}</span>
                <span className={s.sub}>{l.t}</span>
              </div>
            </div>
          ))
        : null}

      {tab === 'guard'
        ? // G1 (ปั๊ม-ถังน้ำ) ถอดออกแล้ว — เหลือกฎที่ยังบังคับใช้จริง
          (
            [
              { title: t.g2, sub: t.g2s },
              { title: t.g3, sub: t.g3s },
              { title: t.g4, sub: t.g4s(offlineCount) },
            ] as const
          ).map((g, i) => (
            <div
              key={g.title}
              className={s.row}
              style={{
                background: 'var(--card-cream-1)',
                ...(rowAnimation(i) ? { animation: rowAnimation(i) } : {}),
              }}
            >
              <div className={s.rowText}>
                <span className={s.title}>{g.title}</span>
                <span className={s.sub}>{g.sub}</span>
              </div>
            </div>
          ))
        : null}
    </Modal>
  );
}
