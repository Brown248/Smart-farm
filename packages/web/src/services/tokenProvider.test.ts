import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getTokenSource,
  resetTokenProviderForTest,
  setManualToken,
  startTokenProvider,
  tokenProvider,
} from './tokenProvider';

/**
 * เทสทั้ง 3 ทางที่ token อาจมาถึง แยกกันคนละเคส
 *
 * เรื่องความปลอดภัยที่ต้องคุมให้ได้:
 *   - อ่านจาก URL แล้ว **ต้องลบออกจาก address bar ทันที**
 *   - `postMessage` ต้องตรวจ `origin` ทุกครั้ง · ไม่ได้ตั้ง origin = ไม่รับเลย
 *   - ห้ามแตะ localStorage/sessionStorage (กฎเหล็กข้อ 6 ของโปรเจกต์)
 */

const PARENT = 'https://main.example.com';

/** ตั้ง URL ของหน้าปัจจุบันโดยไม่ทำให้ jsdom โหลดหน้าใหม่ */
function setUrl(href: string): void {
  window.history.replaceState(null, '', href);
}

/** ปลุก event `message` แบบกำหนด origin ได้ (`postMessage` ของ jsdom บังคับ origin เอง) */
function fireMessage(origin: string, data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { origin, data }));
}

beforeEach(() => {
  resetTokenProviderForTest();
  setUrl('/');
});

afterEach(() => {
  resetTokenProviderForTest();
  vi.restoreAllMocks();
});

describe('ทางที่ 1 — access_token ใน URL', () => {
  it('อ่านค่าได้ และบอกที่มาว่า url', () => {
    setUrl('/dashboard?access_token=jwt-from-url');
    startTokenProvider(PARENT);

    expect(tokenProvider.getToken()).toBe('jwt-from-url');
    expect(getTokenSource()).toBe('url');
  });

  /** ถ้าปล่อยค้าง token จะติดไปกับ history · bookmark · log ของ proxy */
  it('ลบ access_token ออกจาก URL ทันที', () => {
    setUrl('/dashboard?access_token=secret&keep=1');
    startTokenProvider(PARENT);

    expect(window.location.search).not.toContain('access_token');
    expect(window.location.search).toContain('keep=1');
    expect(window.location.pathname).toBe('/dashboard');
  });

  it('ไม่มี param ก็ไม่ได้ token และไม่ไปยุ่งกับ URL', () => {
    setUrl('/dashboard?keep=1');
    startTokenProvider(PARENT);

    expect(tokenProvider.getToken()).toBeNull();
    expect(getTokenSource()).toBe('none');
    expect(window.location.search).toBe('?keep=1');
  });

  it('ไม่แตะ localStorage / sessionStorage เลย', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    setUrl('/?access_token=jwt');
    startTokenProvider(PARENT);

    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
  });
});

describe('ทางที่ 2 — postMessage จาก parent', () => {
  it('รับ token จาก origin ที่ตรงกัน', () => {
    startTokenProvider(PARENT);
    fireMessage(PARENT, { type: 'AUTH_TOKEN', token: 'jwt-from-parent' });

    expect(tokenProvider.getToken()).toBe('jwt-from-parent');
    expect(getTokenSource()).toBe('postMessage');
  });

  /** ป้องกันเว็บอื่นยัด token ปลอมเข้ามาแทน */
  it('ไม่รับจาก origin อื่น', () => {
    startTokenProvider(PARENT);
    fireMessage('https://evil.example.com', { type: 'AUTH_TOKEN', token: 'attacker' });

    expect(tokenProvider.getToken()).toBeNull();
  });

  it('ไม่รับข้อความที่ type ไม่ใช่ AUTH_TOKEN', () => {
    startTokenProvider(PARENT);
    fireMessage(PARENT, { type: 'SOMETHING_ELSE', token: 'nope' });
    fireMessage(PARENT, 'plain string');
    fireMessage(PARENT, null);

    expect(tokenProvider.getToken()).toBeNull();
  });

  it('token ไม่ใช่ string ก็ไม่รับ', () => {
    startTokenProvider(PARENT);
    fireMessage(PARENT, { type: 'AUTH_TOKEN', token: 12345 });

    expect(tokenProvider.getToken()).toBeNull();
  });

  it('parent ส่งตัวใหม่มาแทนตัวเก่าได้', () => {
    startTokenProvider(PARENT);
    fireMessage(PARENT, { type: 'AUTH_TOKEN', token: 'first' });
    fireMessage(PARENT, { type: 'AUTH_TOKEN', token: 'second' });

    expect(tokenProvider.getToken()).toBe('second');
  });

  it('parent ส่ง null = logout → ล้าง token', () => {
    startTokenProvider(PARENT);
    fireMessage(PARENT, { type: 'AUTH_TOKEN', token: 'first' });
    fireMessage(PARENT, { type: 'AUTH_TOKEN', token: null });

    expect(tokenProvider.getToken()).toBeNull();
    expect(getTokenSource()).toBe('none');
  });

  /** ตรวจ origin ไม่ได้ = ไม่ปลอดภัย เลือกไม่รับดีกว่ารับมั่ว */
  it('ยังไม่ได้ตั้ง VITE_PARENT_ORIGIN → ไม่รับเลย และเตือนพร้อมบอก origin ที่ปฏิเสธ', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    startTokenProvider('');
    fireMessage('https://anything.example.com', { type: 'AUTH_TOKEN', token: 'jwt' });

    expect(tokenProvider.getToken()).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    const msg = String(warn.mock.calls[0]?.[0]);
    expect(msg).toContain('VITE_PARENT_ORIGIN');
    // บอกด้วยว่าใครส่งมา — ถ้า origin นั้นถูกต้องก็เอาไปใส่ env ได้เลย
    expect(msg).toContain('https://anything.example.com');
  });

  /*
   * เดิมเตือนตอนบูตทุกครั้งที่เปิดเว็บ ทั้งที่ทางนี้เป็นทางสำรอง (ทางจริงคือ Supabase)
   * คำเตือนที่ขึ้นตลอดเวลาคือคำเตือนที่ไม่มีใครอ่าน แล้ววันที่มีเรื่องจริงก็จะถูกมองข้าม
   */
  it('ไม่ได้ตั้ง origin แล้วไม่มีใครส่งอะไรมา → ต้องไม่เตือน (ไม่ใช่ปัญหา)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    startTokenProvider('');

    expect(warn).not.toHaveBeenCalled();
  });

  it('ข้อความที่ไม่ใช่ AUTH_TOKEN ต้องไม่ทำให้เตือน — เว็บอื่นใช้ postMessage กันทั่วไป', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    startTokenProvider('');
    fireMessage('https://vite.dev', { type: 'vite:hmr-ping' });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('ทางที่ 3 — กรอกเองในโหมด dev', () => {
  it('ตั้งค่าได้ และบอกที่มาว่า manual', () => {
    startTokenProvider(PARENT);
    setManualToken('jwt-typed-by-dev');

    expect(tokenProvider.getToken()).toBe('jwt-typed-by-dev');
    expect(getTokenSource()).toBe('manual');
  });

  it('ตัดช่องว่างหัวท้าย และค่าว่างถือว่าไม่มี token', () => {
    startTokenProvider(PARENT);
    setManualToken('  spaced  ');
    expect(tokenProvider.getToken()).toBe('spaced');

    setManualToken('   ');
    expect(tokenProvider.getToken()).toBeNull();
    expect(getTokenSource()).toBe('none');
  });
});

describe('onChange', () => {
  it('แจ้งทุกครั้งที่ token เปลี่ยน และเลิกฟังได้', () => {
    startTokenProvider(PARENT);
    const seen: (string | null)[] = [];
    const stop = tokenProvider.onChange((t) => seen.push(t));

    fireMessage(PARENT, { type: 'AUTH_TOKEN', token: 'a' });
    setManualToken('b');
    stop();
    setManualToken('c');

    expect(seen).toEqual(['a', 'b']);
    expect(tokenProvider.getToken()).toBe('c');
  });

  it('ค่าเดิมซ้ำไม่แจ้งซ้ำ — กันต่อ socket ใหม่ทั้งที่ token ไม่ได้เปลี่ยน', () => {
    startTokenProvider(PARENT);
    const seen: (string | null)[] = [];
    tokenProvider.onChange((t) => seen.push(t));

    fireMessage(PARENT, { type: 'AUTH_TOKEN', token: 'same' });
    fireMessage(PARENT, { type: 'AUTH_TOKEN', token: 'same' });

    expect(seen).toEqual(['same']);
  });
});

describe('startTokenProvider', () => {
  it('เรียกซ้ำไม่อ่าน URL ซ้ำ (กันติด listener หลายตัว)', () => {
    setUrl('/?access_token=first');
    startTokenProvider(PARENT);
    setUrl('/?access_token=second');
    startTokenProvider(PARENT);

    expect(tokenProvider.getToken()).toBe('first');
    expect(window.location.search).toBe('?access_token=second');
  });
});
