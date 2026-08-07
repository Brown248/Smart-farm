import type { CSSProperties } from 'react';

/**
 * `style` object ที่ยอมให้ตั้ง CSS custom property ได้
 * (React types ยังไม่รับ `--foo` ตรงๆ)
 */
export type CssVars = CSSProperties & Record<`--${string}`, string | number>;
