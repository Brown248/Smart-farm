/**
 * ผู้ช่วย AI ของฟาร์ม — คุยกับเซิร์ฟเวอร์ที่พูดภาษา OpenAI API (`/v1/chat/completions`)
 *
 * ตัวที่ใช้จริงตอนนี้คือ llama.cpp เสิร์ฟ `qwen3.5-9b` ในวง LAN
 * ทุกคำขอวิ่งผ่าน proxy บน origin เดียวกับหน้าเว็บ (ดู `config/liveData.readAiConfig`)
 *
 * 🔴 **AI สั่งอุปกรณ์ไม่ได้ และห้ามทำให้ผู้ใช้เข้าใจว่ามันสั่งได้**
 * โปรเจกต์นี้คุมรีเลย์จริง (พัดลม/ปั๊ม) คำสั่งทุกคำสั่งต้องผ่าน `useDeviceCommand`
 * ซึ่งมี confirm → pending → settle + guard ครบ · ตรงนี้จึงบอกโมเดลไว้ชัดเจนใน system prompt
 * ว่ามันทำได้แค่ "แนะนำ" และเป็นแค่ข้อความ ไม่ได้ต่อกับอะไรทั้งสิ้น
 */
import { readAiConfig } from '@/config/liveData';

/** เผื่อเวลาให้โมเดลคิด — 9B บน CPU/GPU เล็กตอบช้ากว่า API คลาวด์มาก */
export const AI_TIMEOUT_MS = 60_000;

/** กันคำตอบยาวจนล้นกล่องแชทบนแท็บเล็ต (และกันโมเดลร่ายยาวไม่จบ) */
const MAX_TOKENS = 400;

export interface FarmSnapshot {
  readonly tempC: number;
  readonly humidityPct: number;
  readonly lightKlux: number;
  /** ความชื้นดิน — `null` เมื่อยังไม่มีเซนเซอร์จริง */
  readonly soilPct: number | null;
  /** ค่าไหนมาจากเซนเซอร์จริง (ที่เหลือเป็นค่าจำลอง) — ต้องบอกโมเดลด้วย ไม่งั้นมันฟันธงจากเลขปลอม */
  readonly liveFields: readonly string[];
  readonly devicesOn: readonly string[];
  readonly estop: boolean;
}

export type AiError = 'timeout' | 'network' | 'bad-response' | 'not-configured';

export class AiChatError extends Error {
  readonly kind: AiError;
  constructor(kind: AiError) {
    super(`ai-chat:${kind}`);
    this.kind = kind;
  }
}

/**
 * system prompt — บังคับ 3 อย่างที่ถ้าไม่บังคับแล้วพัง
 *   1. **ภาษา** — จุดที่พังจริงและเสียเวลาหาที่สุด
 *   2. **ความสั้น** — คนอ่านบนแท็บเล็ตกลางโรงเรือน ไม่ได้นั่งอ่านเรียงความ
 *   3. **ขอบเขต** — สั่งอุปกรณ์ไม่ได้ และห้ามอ้างว่าทำให้แล้ว
 *
 * 🔴 **คำสั่งทั้งหมดเขียนเป็นภาษาอังกฤษโดยตั้งใจ แม้ตอนอยากให้ตอบไทย**
 *
 * ทดสอบกับ `qwen3.5-9b` ตัวจริงแล้ว: สั่งเป็นภาษาไทยว่า "ตอบเป็นภาษาไทยเสมอ ห้ามตอบภาษาอื่น"
 * มันตอบเป็น**ภาษารัสเซีย** และอีกรอบตอบ**ภาษาจีน** — โมเดลหลายภาษาเชื่อฟังคำสั่งเชิงระบบ
 * ที่เป็นภาษาอังกฤษดีกว่ามาก · เขียนภาษาเป้าหมายกำกับด้วยตัวอักษรของภาษานั้น (ภาษาไทย)
 * แล้ว**ย้ำอีกครั้งท้ายสุด** (โมเดลให้น้ำหนักบรรทัดท้ายมากกว่า) จึงได้ผลคงที่
 *
 * ⚠️ ห้ามใช้วิธี "ใส่ข้อความนำฝั่ง assistant" (เช่นเติม `{role:'assistant', content:'ตอบเป็นภาษาไทย:'}`)
 * ลองแล้วโมเดลพ่นอักขระเสียออกมาทั้งก้อน
 */
function systemPrompt(lang: string, farm: FarmSnapshot): string {
  const thai = lang === 'th';
  const soil = farm.soilPct === null ? 'no sensor' : `${Math.round(farm.soilPct)}%`;
  const on = farm.devicesOn.length > 0 ? farm.devicesOn.join(', ') : 'none';
  const live = farm.liveFields.length > 0 ? farm.liveFields.join(', ') : 'none';

  const state = [
    `temperature=${farm.tempC.toFixed(1)}C`,
    `air_humidity=${Math.round(farm.humidityPct)}%`,
    `light=${farm.lightKlux.toFixed(1)}klux`,
    `soil_moisture=${soil}`,
    `devices_running=[${on}]`,
    `emergency_stop=${farm.estop ? 'ACTIVE' : 'off'}`,
    `values_from_real_sensors=[${live}]`,
  ].join(' · ');

  const language = thai
    ? 'You MUST write your entire reply in Thai language (ภาษาไทย) only. Never use English, Chinese, or Russian.'
    : 'You MUST write your entire reply in English only.';

  return [
    'You are the assistant for "Greenhouse A1", a Syntech vegetable greenhouse in Thailand.',
    `CRITICAL: ${language}`,
    'Keep it under 4 short lines — the reader is a farmer looking at a tablet inside the greenhouse.',
    'If you recommend an action, give short concrete steps.',
    'CRITICAL: You CANNOT control any device. You may only advise.',
    'Never claim you turned anything on or off — the user must press the buttons in the app themselves.',
    /*
     * รายการอุปกรณ์จริง — **จำเป็น** ไม่ใช่ของประดับ
     * ทดสอบแล้วโมเดลแนะนำให้ "เปิดม่านกันแดด" ซึ่งโรงเรือนนี้ไม่มี
     * คำแนะนำที่อ้างของที่ไม่มีอยู่จริงทำให้เกษตรกรสับสนและเสียความเชื่อถือทั้งระบบ
     */
    'EQUIPMENT — the greenhouse has ONLY these, never suggest anything else:',
    '- 2 large exhaust fans (big1, big2)',
    '- 1 small fan (sml1) wired to big2, it cannot be switched separately',
    '- 1 water pump (pump) that waters all 8 beds at once; there are no per-bed valves',
    'There is NO shade screen, NO misting, NO cooling unit, NO grow lights, NO heater.',
    'The greenhouse is closed, so rain outside does not affect watering.',
    'Values not listed in values_from_real_sensors are simulated; do not draw firm conclusions from them.',
    `Current greenhouse readings: ${state}`,
    '',
    // ย้ำท้ายสุด — บรรทัดสุดท้ายคือสิ่งที่โมเดลให้น้ำหนักมากที่สุด
    thai ? 'Reminder: reply in Thai (ภาษาไทย) only.' : 'Reminder: reply in English only.',
  ].join('\n');
}

interface ChatTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/** รูปร่างคำตอบเท่าที่เราต้องใช้ — ไม่ผูกกับ field อื่นที่เซิร์ฟเวอร์แต่ละตัวใส่ไม่เหมือนกัน */
interface ChatResponse {
  readonly choices?: readonly { readonly message?: { readonly content?: unknown } }[];
}

/**
 * ถาม AI · โยน `AiChatError` เมื่อพลาด (ผู้เรียกเป็นคนตัดสินใจว่าจะโชว์อะไร)
 * `history` = บทสนทนาก่อนหน้า เพื่อให้ถามต่อเนื่องได้ (ตัดให้สั้นก่อนส่งมา)
 */
export async function askFarmAi(
  question: string,
  farm: FarmSnapshot,
  lang: string,
  history: readonly ChatTurn[] = [],
): Promise<string> {
  const cfg = readAiConfig();
  if (cfg === null) throw new AiChatError('not-configured');

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: systemPrompt(lang, farm) },
          ...history,
          { role: 'user', content: question },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        stream: false,
      }),
      // ไม่มี signal = คำขอค้างได้เป็นนาที แล้วกล่องแชทหมุนค้างโดยไม่มีทางออก
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') throw new AiChatError('timeout');
    throw new AiChatError('network');
  }

  if (!res.ok) throw new AiChatError('network');

  let data: ChatResponse;
  try {
    data = (await res.json()) as ChatResponse;
  } catch {
    throw new AiChatError('bad-response');
  }

  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || text.trim() === '') throw new AiChatError('bad-response');
  return text.trim();
}
