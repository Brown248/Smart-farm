import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/i18n/I18nProvider';
import { TH } from '@/i18n/th';
import { RailAccount } from './RailAccount';

/**
 * ท้ายแถบเมนู 3 สถานะ — เดิมฝังชื่อ "สมชาย ใจดี" ไว้ตายตัว
 *
 * เรื่องที่ต้องคุม: **ยังไม่ตั้งค่า Supabase ต้องไม่มีปุ่มเข้าสู่ระบบ**
 * กดไปก็ทำอะไรไม่ได้ = ปุ่มหลอก (ขัดกฎเหล็กข้อ 3)
 */
const mocks = vi.hoisted(() => ({
  configured: { value: false },
  session: { email: null as string | null },
  signOutCalls: { n: 0 },
}));

vi.mock('@/config/liveData', () => ({
  isAuthConfigured: () => mocks.configured.value,
  readSupabaseConfig: () => (mocks.configured.value ? { url: 'https://x', anonKey: 'k' } : null),
  readLiveDataConfig: () => null,
  missingLiveEnv: () => ['VITE_WS_URL'],
  isLiveConfigured: () => false,
  parentOrigin: () => '',
  LIVE_ENV_KEYS: ['VITE_WS_URL'],
  SUPABASE_ENV_KEYS: ['VITE_SUPABASE_URL'],
}));

vi.mock('@/services/supabaseAuth', () => ({
  AUTH_STORAGE_KEY: 'syntech-auth',
  getSupabase: () =>
    mocks.configured.value
      ? {
          auth: {
            getSession: async () => ({
              data: {
                session: mocks.session.email ? { user: { email: mocks.session.email } } : null,
              },
            }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
          },
        }
      : null,
  signIn: async () => null,
  signOut: async () => {
    mocks.signOutCalls.n += 1;
  },
  startSupabaseAuth: () => undefined,
}));

const renderRail = (collapsed = false) =>
  render(
    <I18nProvider>
      <RailAccount collapsed={collapsed} />
    </I18nProvider>,
  );

beforeEach(() => {
  mocks.configured.value = false;
  mocks.session.email = null;
  mocks.signOutCalls.n = 0;
});

describe('RailAccount', () => {
  it('ยังไม่ตั้งค่า Supabase → ไม่มีปุ่มเข้าสู่ระบบ (จะกดไปก็ทำอะไรไม่ได้)', () => {
    renderRail();

    expect(screen.queryByRole('button', { name: TH.authSignIn })).not.toBeInTheDocument();
    expect(screen.getByText(TH.authOffTitle)).toBeInTheDocument();
    expect(screen.getByText(TH.authOffHint)).toBeInTheDocument();
  });

  it('ตั้งค่าแล้วแต่ยังไม่ล็อกอิน → มีปุ่มเข้าสู่ระบบ กดแล้วเปิดฟอร์ม', async () => {
    mocks.configured.value = true;
    const user = userEvent.setup();
    renderRail();

    const btn = await screen.findByRole('button', { name: TH.authSignIn });
    await user.click(btn);

    const dialog = await screen.findByRole('dialog', { name: TH.loginTitle });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText(TH.loginEmail)).toBeInTheDocument();
    expect(screen.getByLabelText(TH.loginPassword)).toBeInTheDocument();
  });

  it('ปุ่มเข้าสู่ระบบยังกดไม่ได้จนกรอกครบทั้งอีเมลและรหัสผ่าน', async () => {
    mocks.configured.value = true;
    const user = userEvent.setup();
    renderRail();
    await user.click(await screen.findByRole('button', { name: TH.authSignIn }));

    const submit = screen.getByRole('button', { name: TH.loginSubmitAria });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(TH.loginEmail), 'a@b.co');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(TH.loginPassword), 'pw');
    expect(submit).toBeEnabled();
  });

  it('ล็อกอินแล้ว → โชว์อีเมลจริง ไม่ใช่ชื่อที่ฝังไว้ · มีปุ่มออกจากระบบ', async () => {
    mocks.configured.value = true;
    mocks.session.email = 'somchai@syntech.co.th';
    const user = userEvent.setup();
    renderRail();

    expect(await screen.findByText('somchai@syntech.co.th')).toBeInTheDocument();
    expect(screen.getByText(TH.authSignedIn)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: TH.authSignOut }));
    expect(mocks.signOutCalls.n).toBe(1);
  });

  it('แถบยุบ → ซ่อนข้อความ แต่ยังมีปุ่มและชื่อที่ screen reader อ่านได้', async () => {
    mocks.configured.value = true;
    renderRail(true);

    const btn = await screen.findByRole('button', { name: TH.authSignIn });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent?.trim()).toBe('');
  });
});
