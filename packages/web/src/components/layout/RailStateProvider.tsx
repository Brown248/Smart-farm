import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface RailState {
  readonly collapsed: boolean;
  readonly toggle: () => void;
}

const RailContext = createContext<RailState | null>(null);

/**
 * สถานะย่อ/ขยายเมนู เก็บไว้ที่ระดับแอปด้วย React state ล้วน
 * (กฎเหล็กข้อ 7 ห้ามใช้ localStorage) — วางไว้เหนือ router เพื่อให้ค่าคงอยู่ตอนสลับหน้า
 */
export function RailStateProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = useCallback(() => setCollapsed((v) => !v), []);
  const value = useMemo<RailState>(() => ({ collapsed, toggle }), [collapsed, toggle]);
  return <RailContext.Provider value={value}>{children}</RailContext.Provider>;
}

/** ใช้ได้แม้ไม่มี provider (เช่นในเทสที่ render component เดี่ยว) */
export function useRailState(): RailState {
  const ctx = useContext(RailContext);
  const [fallback, setFallback] = useState(false);
  const fallbackToggle = useCallback(() => setFallback((v) => !v), []);
  return ctx ?? { collapsed: fallback, toggle: fallbackToggle };
}
