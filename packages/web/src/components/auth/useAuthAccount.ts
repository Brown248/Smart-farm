import { useEffect, useState } from 'react';
import { isAuthConfigured } from '@/config/liveData';
import { getSupabase } from '@/services/supabaseAuth';

/**
 * ใครล็อกอินอยู่ — เอาไปแสดงในแถบเมนูแทนชื่อปลอมที่เคยฝังไว้ ("สมชาย ใจดี")
 *
 * `unconfigured` = ยังไม่ได้ตั้ง env ของ Supabase → ไม่ต้องโชว์ปุ่มเข้าสู่ระบบเลย
 * `signedOut`    = ตั้งแล้วแต่ยังไม่ได้เข้า → โชว์ปุ่มให้กด
 * `signedIn`     = มี session → โชว์อีเมลกับปุ่มออก
 */
export type AccountStatus = 'unconfigured' | 'loading' | 'signedOut' | 'signedIn';

export interface AuthAccount {
  readonly status: AccountStatus;
  readonly email: string | null;
}

export function useAuthAccount(): AuthAccount {
  const configured = isAuthConfigured();
  const [status, setStatus] = useState<AccountStatus>(configured ? 'loading' : 'unconfigured');
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setStatus('unconfigured');
      setEmail(null);
      return;
    }

    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setEmail(data.session?.user.email ?? null);
      setStatus(data.session ? 'signedIn' : 'signedOut');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!alive) return;
      setEmail(session?.user.email ?? null);
      setStatus(session ? 'signedIn' : 'signedOut');
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  return { status, email };
}
