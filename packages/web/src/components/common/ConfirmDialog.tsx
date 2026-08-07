import { Button } from './Button';
import { Modal } from './Modal';
import type { ConfirmRequest } from '@/hooks/useConfirm';
import s from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  readonly request: ConfirmRequest | null;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onCancel: () => void;
  readonly onAccept: () => void;
}

/**
 * กล่องยืนยันคำสั่ง — ปิดด้วยการแตะฉากหลังไม่ได้โดยตั้งใจ
 * ผู้ใช้ต้องเลือกอย่างใดอย่างหนึ่ง (ยกเลิก หรือ ยืนยัน)
 */
export function ConfirmDialog({
  request,
  confirmLabel,
  cancelLabel,
  onCancel,
  onAccept,
}: ConfirmDialogProps) {
  if (!request) return null;
  const warn = request.tone === 'warn';
  return (
    <Modal open variant="center" zIndex={82}>
      <strong className={s.title} style={warn ? { color: 'var(--d-warn-ink-2)' } : undefined}>
        {request.title}
      </strong>
      <p className={s.body}>{request.body}</p>
      <div className={s.actions}>
        <Button className={s.action} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant="primary"
          className={s.action}
          style={warn ? { background: 'var(--d-warn)', borderColor: 'var(--d-warn)' } : undefined}
          onClick={onAccept}
        >
          {request.confirmLabel ?? confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
