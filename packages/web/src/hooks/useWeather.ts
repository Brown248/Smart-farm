import { useEffect, useState } from 'react';
import { farmLocation } from '@/config/liveData';
import { isRainingNow } from '@/lib/weatherCode';

/**
 * พยากรณ์อากาศจริงของฟาร์ม (เวลาไทย) จาก **Open-Meteo** — ฟรี ไม่ต้องมี API key
 *
 * เอาไปสองทาง:
 *   1. การ์ดพยากรณ์บนแดชบอร์ด (temp/สภาพ/5 วัน)
 *   2. ฉากเกม — กลางคืนตามพระอาทิตย์ตกจริง (`isDay`) · ฝนตกตามจริง (`isRaining`)
 *
 * ดึงไม่ได้ (เน็ตหลุด/API ล่ม) → คืน `null` ให้ผู้เรียก fallback (ฉากใช้เวลาเครื่อง · การ์ดซ่อน)
 * `timezone=Asia/Bangkok` ทำให้ `is_day` อิงพระอาทิตย์ขึ้น-ตกที่ไทยจริง ไม่ใช่ timezone ของเบราว์เซอร์
 */
export interface DailyForecast {
  readonly date: string; // ISO `YYYY-MM-DD`
  readonly code: number;
  readonly min: number;
  readonly max: number;
  readonly rainChance: number; // %
}

export interface Weather {
  readonly tempC: number;
  readonly humidity: number;
  readonly code: number;
  /** กลางวันไหม (จากพระอาทิตย์ขึ้น-ตกจริงที่ไทย) — `false` = กลางคืน */
  readonly isDay: boolean;
  readonly precipitationMm: number;
  /** ฝนตกอยู่ไหม — รหัสอากาศเป็นฝน/พายุ หรือวัดปริมาณได้ */
  readonly isRaining: boolean;
  readonly daily: readonly DailyForecast[];
  /** เวลาที่ดึงล่าสุด (ms epoch) */
  readonly fetchedAt: number;
}

const REFRESH_MS = 15 * 60 * 1000;

interface RawResponse {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    is_day?: number;
    precipitation?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
}

function parse(raw: RawResponse, fetchedAt: number): Weather | null {
  const c = raw.current;
  const d = raw.daily;
  if (!c || typeof c.temperature_2m !== 'number' || typeof c.weather_code !== 'number') return null;

  const daily: DailyForecast[] = [];
  const times = d?.time ?? [];
  for (let i = 0; i < times.length; i++) {
    const date = times[i];
    const code = d?.weather_code?.[i];
    const max = d?.temperature_2m_max?.[i];
    const min = d?.temperature_2m_min?.[i];
    if (date === undefined || code === undefined || max === undefined || min === undefined)
      continue;
    daily.push({ date, code, min, max, rainChance: d?.precipitation_probability_max?.[i] ?? 0 });
  }

  const precipitationMm = c.precipitation ?? 0;
  return {
    tempC: c.temperature_2m,
    humidity: c.relative_humidity_2m ?? 0,
    code: c.weather_code,
    isDay: c.is_day !== 0,
    precipitationMm,
    isRaining: isRainingNow(c.weather_code, precipitationMm),
    daily,
    fetchedAt,
  };
}

export function useWeather(): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    const { lat, lon } = farmLocation();
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code,is_day,precipitation` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=Asia%2FBangkok&forecast_days=5`;

    let alive = true;
    const controller = new AbortController();

    const load = async (): Promise<void> => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        const raw = (await res.json()) as RawResponse;
        if (!alive) return;
        const parsed = parse(raw, Date.now());
        if (parsed) setWeather(parsed);
      } catch {
        // เน็ตหลุด/ยกเลิก — เงียบไว้ ผู้เรียก fallback เอง (ไม่ทำให้แอปพัง)
      }
    };

    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(id);
    };
  }, []);

  return weather;
}
