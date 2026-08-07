import { useState } from 'react';
import { Icon } from '@/components/common/Icon';
import { signOut } from '@/services/supabaseAuth';
import { useI18n } from '@/i18n/useI18n';
import { LoginModal } from './LoginModal';
import { useAuthAccount } from './useAuthAccount';
import s from './RailAccount.module.css';

export interface RailAccountProps {
  readonly collapsed: boolean;
}

/**
 * ท้ายแถบเมนู — ใครใช้งานอยู่
 *
 * เดิมฝังชื่อ "สมชาย ใจดี" ไว้ตายตัว ตอนนี้แสดงบัญชีจริงที่ล็อกอินอยู่
 * และเป็นทางเข้าสู่ระบบด้วย — ไม่บังคับล็อกอินก่อนใช้แอป ไม่ล็อกอินก็ดูข้อมูลจำลองได้
 *
 * ยังไม่ได้ตั้ง env ของ Supabase → ไม่โชว์ปุ่มเข้าสู่ระบบเลย (จะกดไปก็ทำอะไรไม่ได้ = ปุ่มหลอก)
 */
export function RailAccount({ collapsed }: RailAccountProps) {
  const { t } = useI18n();
  const { status, email } = useAuthAccount();
  const [loginOpen, setLoginOpen] = useState(false);

  if (status === 'unconfigured') {
    return (
      <div className={s.box}>
        <span className={s.avatarOff} aria-hidden="true">
          <Icon name="info" size={16} color="var(--d-muted)" strokeWidth={1.9} />
        </span>
        {collapsed ? null : (
          <span className={s.text}>
            <span className={s.name}>{t.authOffTitle}</span>
            <span className={s.role}>{t.authOffHint}</span>
          </span>
        )}
      </div>
    );
  }

  if (status === 'signedIn' && email) {
    const initial = email.trim().slice(0, 2).toUpperCase();
    return (
      <div className={s.box}>
        <span className={s.avatar} aria-hidden="true">
          {initial}
        </span>
        {collapsed ? null : (
          <>
            <span className={s.text}>
              <span className={s.name} title={email}>
                {email}
              </span>
              <span className={s.role}>{t.authSignedIn}</span>
            </span>
            <button
              type="button"
              className={s.iconBtn}
              aria-label={t.authSignOut}
              title={t.authSignOut}
              onClick={() => void signOut()}
            >
              <Icon name="close" size={15} strokeWidth={2.2} />
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={[s.signInBtn, collapsed ? s.compact : null].filter(Boolean).join(' ')}
        aria-label={t.authSignIn}
        title={t.authSignIn}
        onClick={() => setLoginOpen(true)}
      >
        <span className={s.signInIcon} aria-hidden="true">
          <Icon name="chevronRight" size={16} strokeWidth={2.2} />
        </span>
        {collapsed ? null : <span className={s.signInLabel}>{t.authSignIn}</span>}
      </button>

      {loginOpen ? <LoginModal onClose={() => setLoginOpen(false)} /> : null}
    </>
  );
}
