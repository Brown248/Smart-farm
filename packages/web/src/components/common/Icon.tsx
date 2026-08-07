/**
 * ชุดไอคอนเส้นเดียว — ถอด path ทั้งหมดจาก `ic()` และ `cropIcon()` ใน
 * Syntech Dashboard.dc.html ห้ามวาดใหม่
 */
export const ICON_PATHS = {
  dashboard: 'M3 13h8V3H3zM13 21h8V3h-8zM3 21h8v-6H3z',
  house: 'M3 11l9-7 9 7M5 10v10h14V10M9 20v-6h6v6',
  drop: 'M12 22a7 7 0 0 0 7-7c0-5-7-13-7-13S5 10 5 15a7 7 0 0 0 7 7z',
  reports: 'M3 3v18h18M8 15l3-4 3 2 4-6',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 2h-4l-.4 2.6a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L4 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z',
  temp: 'M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z',
  humid: 'M17 14a4 4 0 0 0-1-7.9A6 6 0 0 0 4.5 8 3.5 3.5 0 0 0 5 15M8 18l-1 3M13 18l-1 3',
  sun: 'M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19',
  soil: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  zones: 'M9 3L4 5v16l5-2 6 2 5-2V3l-5 2-6-2zM9 3v16M15 5v16',
  alert:
    'M10.3 4.3L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  water: 'M12 22a7 7 0 0 0 7-7c0-5-7-13-7-13S5 10 5 15a7 7 0 0 0 7 7z',
  chip: 'M9 2v2M15 2v2M9 20v2M15 20v2M20 9h2M20 15h2M2 9h2M2 15h2M6 6h12v12H6z',
  npk: 'M4 20h4M6 20V9M6 9l3-4 6 3 3-4M18 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  spray: 'M4 12h4l2-2V4l4 4-4 4v-4M12 12v8M9 20h6',
  harvest: 'M4 21c8 0 12-5 16-16-6 0-10 3-12 8M4 21c0-6 3-10 8-12',
  prune:
    'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.1 7.5L20 19M8.1 16.5L20 5',
  solar: 'M4 20h16M6 20l1-8h10l1 8M9 4l-1 4M15 4l1 4M12 3v5',
  fan: 'M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 10c0-4 1-6 2-6M14 12c4 0 6 1 6 2M12 14c0 4-1 6-2 6M10 12c-4 0-6-1-6-2',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  bulb: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
  leaf: 'M12 20c0-5 2.5-8 8-9-1 5-3.5 8-8 9ZM12 20c0-4-2-6.5-7-7.5 1 4.5 3 7 7 7.5ZM12 20v-6',
  clock: 'M12 8v4l2.5 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  download: 'M12 3v12M8 11l4 4 4-4M4 21h16',
  compare: 'M3 3v18h18M7 14l4-4 3 3 5-6',
  refresh: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  check: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  photo: 'M3 5h18v14H3zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM21 17l-5-5-8 7',
  notebook: 'M7 3h10a2 2 0 0 1 2 2v16l-7-3-7 3V5a2 2 0 0 1 2-2zM9.5 9h5',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  chatBubble: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M5 12l7 7 7-7',
  flat: 'M4 12h16',

  /* ── เพิ่มในเฟส 3–6 ── */
  tank: 'M5 8h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM5 8V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M8 13h8',
  pipe: 'M4 8h10a4 4 0 0 1 4 4v8M4 8V4M8 8V4',
  flow: 'M3 12h4l3-8 4 16 3-8h4',
  pump: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v3M12 18v3M3 12h3M18 12h3',
  stop: 'M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  wxRain:
    'M17 13a4 4 0 0 0-1-7.9A6 6 0 0 0 4.5 7 3.5 3.5 0 0 0 5 14M8 17l-1 3M12 17l-1 3M16 17l-1 3',
  wxCloud: 'M17 15a4 4 0 0 0-1-7.9A6 6 0 0 0 4.5 9 3.5 3.5 0 0 0 5 16',
  wxSun:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19',
  door: 'M15 3h4v18h-4M15 12H4M8 8l-4 4 4 4',
  gear: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  care: 'M12 21C7 17 4 13.5 4 10a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 3.5-3 7-8 11z',
  info: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 8h.01M11 12h1v4h1',
  chevronRight: 'M9 6l6 6-6 6',
  tick: 'M20 6L9 17l-5-5',
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** ไอคอนพืชประจำโซน */
export const CROP_ICON_PATHS = {
  kale: 'M12 21c0-5-3-8-8-8 0 5 3 8 8 8zM12 21c0-5 3-8 8-8 0 5-3 8-8 8zM12 21V9M12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  flowers:
    'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 7V4M12 13c0 4-1 7-3 7M12 13c0 4 1 7 3 7M9.5 8.5L7 7M14.5 8.5L17 7',
  rosemary: 'M12 21V6M12 8l3-3M12 12l3-3M12 16l3-3M12 8L9 5M12 12L9 9M12 16L9 13',
  mushroom: 'M5 11a7 7 0 0 1 14 0zM10 11v6a2 2 0 0 0 4 0v-6',
  salad: 'M4 11h16a8 8 0 0 1-16 0zM7 11c0-3 2-5 5-5M12 6c3 0 5 2 5 5M12 6V3',
  cucumber: 'M6 18a6 10 0 0 1 12-12 6 10 0 0 1-12 12zM9 9l.01 0M13 13l.01 0',
  strawberry:
    'M12 21c-4 0-6-3-6-7 0-2 3-4 6-4s6 2 6 4c0 4-2 7-6 7zM8 6c1.5 1 3 1.5 4 1.5S14.5 7 16 6M12 7.5V4',
  tomato:
    'M12 21a6 6 0 0 0 6-6c0-3-3-6-6-6s-6 3-6 6a6 6 0 0 0 6 6zM12 9c-1-1.5-1-3 .5-4.5M12 9c1-1 2.5-1 4-.5',
} as const;

export type CropIconName = keyof typeof CROP_ICON_PATHS;

export interface IconProps {
  readonly name: IconName;
  readonly size?: number | undefined;
  readonly color?: string | undefined;
  readonly strokeWidth?: number | undefined;
}

export function Icon({ name, size = 22, color = 'currentColor', strokeWidth = 1.7 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export interface CropIconProps {
  readonly name: CropIconName;
  readonly size?: number | undefined;
  readonly color?: string | undefined;
}

export function CropIcon({ name, size = 20, color = 'currentColor' }: CropIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={CROP_ICON_PATHS[name]} />
    </svg>
  );
}
