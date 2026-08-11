import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

/**
 * `findBy*` รอได้นานขึ้น — ดีฟอลต์ 1 วินาทีสั้นเกินไปหลังแยกก้อนตามหน้า (`routes.tsx`)
 *
 * หน้าเพจถูก `lazy()` แล้ว เทสที่เรนเดอร์ผ่าน `AppRoutes` จึงต้องรอ vite แปลงไฟล์ก้อนนั้นก่อน
 * รันชุดเดียวทันใน ~400ms แต่ตอนรันทั้งโปรเจกต์พร้อมกันหลายชุด CPU แย่งกันจนเกิน 1 วิ
 * → เทสแดงสลับไปมาโดยที่โค้ดไม่ได้ช้าลงเลย (แอปจริงโหลดก้อนที่ build แล้ว ไม่ต้องแปลง)
 */
configure({ asyncUtilTimeout: 5000 });

/** jsdom ยังไม่มี matchMedia — ทดสอบ reduced-motion ต้องพึ่งตัวนี้ */
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

/** ให้ผลลัพธ์คงที่: บอกว่า reduced-motion ปิดอยู่ เว้นแต่เทสจะ override */
export function setReducedMotion(reduced: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduced && query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

/**
 * เทสห้ามยิงเน็ตจริง — `useWeather` (Open-Meteo) จะโดน reject แล้ว fallback เป็น `null`
 * (การ์ดพยากรณ์ไม่แสดง · ฉากใช้เวลาเครื่อง) ทำให้เทสไม่ช้า/ไม่ flaky ตามเน็ต
 */
globalThis.fetch = (() =>
  Promise.reject(new Error('network disabled in tests'))) as unknown as typeof fetch;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
