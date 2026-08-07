import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useConfirm } from './useConfirm';

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

const req = (run: () => void) => ({ title: 'หัวข้อ', body: 'เนื้อความ', run });

/**
 * กล่องยืนยันคือด่านสุดท้ายก่อนสั่งอุปกรณ์จริง — ถ้ามันยิงคำสั่งซ้ำ
 * ผู้ใช้กดครั้งเดียวแต่ปั๊ม/พัดลมได้รับคำสั่งสองรอบ ห้ามให้เกิดเด็ดขาด
 */
describe('useConfirm', () => {
  it('กดยืนยันแล้วสั่งงานครั้งเดียว แม้อยู่ใต้ StrictMode', () => {
    const run = vi.fn();
    const { result } = renderHook(() => useConfirm(), { wrapper: strict });

    act(() => result.current.ask(req(run)));
    expect(result.current.request).not.toBeNull();

    act(() => result.current.accept());

    expect(run).toHaveBeenCalledTimes(1);
    expect(result.current.request).toBeNull();
  });

  it('กดยืนยันรัวสองที ก็ยังสั่งครั้งเดียว', () => {
    const run = vi.fn();
    const { result } = renderHook(() => useConfirm(), { wrapper: strict });

    act(() => result.current.ask(req(run)));
    act(() => {
      result.current.accept();
      result.current.accept();
    });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('กดยกเลิกแล้วไม่สั่งงาน และกดยืนยันทีหลังก็ไม่สั่ง', () => {
    const run = vi.fn();
    const { result } = renderHook(() => useConfirm(), { wrapper: strict });

    act(() => result.current.ask(req(run)));
    act(() => result.current.cancel());
    act(() => result.current.accept());

    expect(run).not.toHaveBeenCalled();
    expect(result.current.request).toBeNull();
  });

  it('ยืนยันตอนไม่มีคำขอค้างอยู่ ไม่พัง', () => {
    const { result } = renderHook(() => useConfirm(), { wrapper: strict });
    expect(() => act(() => result.current.accept())).not.toThrow();
  });
});
