import { useState } from 'react';
import { Icon } from '@/components/common/Icon';
import { signIn } from '@/services/supabaseAuth';
import { useI18n } from '@/i18n/useI18n';
import m from '@/components/dashboard/modals.module.css';
import s from './LoginModal.module.css';

export interface LoginModalProps {
  readonly onClose: () => void;
}

/**
 * เข้าสู่ระบบด้วยบัญชีของตัวเอง — ผู้ใช้แต่ละคนมีบัญชีแยกกัน (เจ้าของงานเลือกแล้ว)
 * ฝั่ง backend จะได้รู้ว่าใครสั่งอะไร ไม่ใช่ทุกคนกลายเป็นบัญชีเดียวกัน
 *
 * **ไม่บังคับให้ล็อกอินก่อนใช้แอป** — ไม่ล็อกอินก็ยังดูข้อมูลจำลองได้ตามปกติ
 * แค่จะยังไม่มี token ไปต่อ WebSocket จึงไม่มีค่าจริง
 */
export function LoginModal({ onClose }: LoginModalProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (busy || email.trim() === '' || password === '') return;
    setBusy(true);
    setError(null);
    const msg = await signIn(email.trim(), password);
    setBusy(false);
    if (msg === null) onClose();
    else setError(msg);
  };

  return (
    <div
      className={m.overlay}
      style={{ zIndex: 95 }}
      role="dialog"
      aria-modal="true"
      aria-label={t.loginTitle}
    >
      <button
        type="button"
        className={m.scrim}
        aria-label={t.close}
        tabIndex={-1}
        onClick={onClose}
      />
      <div className={m.panel} style={{ maxWidth: 380 }}>
        <div className={m.head}>
          <span className={m.headIcon} style={{ background: 'var(--d-ok-bg)' }} aria-hidden="true">
            <Icon name="check" size={20} color="var(--brand-green)" strokeWidth={1.9} />
          </span>
          <h3 className={m.title}>{t.loginTitle}</h3>
        </div>
        <p className={m.hint}>{t.loginHint}</p>

        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className={s.field}>
            <span className={s.label}>{t.loginEmail}</span>
            <input
              className={s.input}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className={s.field}>
            <span className={s.label}>{t.loginPassword}</span>
            <input
              className={s.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error ? (
            <div className={s.error} role="alert">
              <Icon name="alert" size={16} color="#a8302b" strokeWidth={2} />
              <span>{error}</span>
            </div>
          ) : null}

          <div className={m.actions}>
            <button type="button" className={m.cancelBtn} onClick={onClose}>
              {t.cancel}
            </button>
            {/*
              ปุ่มนี้กับปุ่มทางเข้าที่แถบเมนูใช้ข้อความเดียวกัน ("เข้าสู่ระบบ") และอยู่ใน DOM
              พร้อมกันตอนฟอร์มเปิด → ชื่อ accessible ซ้ำ คนใช้ screen reader แยกไม่ออก
              เติมบริบทใน aria-label ตามแนวเดิมของโปรเจกต์ — ข้อความที่ตาเห็นคงเดิม (กับดักข้อ 5)
            */}
            <button
              type="submit"
              className={m.saveBtn}
              aria-label={t.loginSubmitAria}
              disabled={busy || email.trim() === '' || password === ''}
            >
              {busy ? t.loginBusy : t.loginSubmit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
