#!/usr/bin/env node
/*
 * ⭐ Smoke-test `setSwitch` กับ backend จริง (handysense-farm)
 *
 *   npm run smoke:switch            # ทดสอบ ch0,1,2 ครบ (เปิด→ดู led→ปิด→ดู led)
 *   npm run smoke:switch -- 0       # เฉพาะ channel 0
 *   npm run smoke:switch -- 0 2     # เฉพาะ ch0 และ ch2
 *
 * 🔴🔴 สคริปต์นี้ **สั่งพัดลมจริงในโรงเรือน** (เปิดแล้วปิดคืน) — รันเมื่อพร้อมรับผลจริงเท่านั้น
 *      · แตะเฉพาะ channel 0-2 (พัดลม) · **ไม่แตะ channel 3 (test) และปั๊ม** โดยเด็ดขาด
 *      · จบการทดสอบแต่ละช่องด้วยการสั่ง "ปิด" (สถานะพักที่ปลอดภัย)
 *
 * สคริปต์นี้พิสูจน์ **ชั้นข้อมูล**: reqId ที่ส่ง ↔ reqId ใน cmd_result, เวลาที่ cmd_result มา,
 * เวลาที่ led{n} เปลี่ยนจริงตามมา, และเคส timeout
 * ส่วน **UI** (โชว์ "ส่งคำสั่งแล้ว" ก่อน "เปิดแล้ว", ป้าย automation-override) ต้องดูบนเบราว์เจอร์เอง —
 * ดูเช็คลิสต์ท้าย output
 *
 * env อ่านจาก packages/web/.env(.local) เหมือน get-token.cjs (SYNEXTA_EMAIL/PASSWORD, VITE_*)
 */
const fs = require('node:fs');
const path = require('node:path');

const WEB = path.join(__dirname, '..', 'packages', 'web');

function readEnvFiles() {
  const out = {};
  for (const name of ['.env', '.env.local']) {
    const p = path.join(WEB, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$/);
      if (!m || line.trimStart().startsWith('#')) continue;
      out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

const fileEnv = readEnvFiles();
const pick = (key) => process.env[key] ?? fileEnv[key] ?? '';

const supabaseUrl = pick('VITE_SUPABASE_URL').replace(/\/+$/, '');
const anonKey = pick('VITE_SUPABASE_ANON_KEY');
const email = pick('SYNEXTA_EMAIL');
const password = pick('SYNEXTA_PASSWORD');
const wsUrl = pick('VITE_WS_URL').replace(/\/+$/, '');
const deviceId = pick('VITE_FARM_DEVICE_ID');
const orgId = pick('VITE_FARM_ORG_ID');
const apiBase = wsUrl + '/api/v1';

const OK = '✓';
const NO = '✗';
const die = (msg) => {
  console.error('✗ ' + msg);
  process.exit(1);
};

/** channel ที่ยอมให้ทดสอบ = พัดลมเท่านั้น (ch3=test, ปั๊ม=ยังไม่ต่อ → ห้าม) */
const ALLOWED = [0, 1, 2];
const argChannels = process.argv
  .slice(2)
  .map((s) => Number(s))
  .filter((n) => Number.isInteger(n));
const channels = argChannels.length > 0 ? argChannels.filter((c) => ALLOWED.includes(c)) : ALLOWED;
if (argChannels.some((c) => !ALLOWED.includes(c))) {
  die('อนุญาตเฉพาะ channel 0-2 (พัดลม) — channel 3 เป็น test และปั๊มยังไม่ต่อ ห้ามทดสอบ');
}

const RESULT_TIMEOUT_MS = 15_000; // guide ข้อ 4.2
const LED_TIMEOUT_MS = 12_000; // guide ข้อ 7: สถานะจริงตามมา ≤10 วิ (เผื่อ 2 วิ)
const SETTLE_MS = 2_000; // เว้นจังหวะระหว่างเปิด↔ปิด

const newReqId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** state สังเกตการณ์ที่ป้อนจาก socket */
const obs = {
  led: { 0: null, 1: null, 2: null }, // ค่า led{ch} ล่าสุด (boolean|null)
  ledAt: { 0: 0, 1: 0, 2: 0 }, // เวลาที่ led{ch} มาล่าสุด
  cmd: [], // { reqId, ok, error, partial, channel, at, raw }
};

function asBool(v) {
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'on') return true;
  if (s === 'false' || s === '0' || s === 'off') return false;
  return null;
}

/** ดูดค่า led + cmd_result จาก event ไหนก็ได้ (telemetry_data / attribute_data) */
function ingest(evt) {
  const data = evt?.data ?? evt?.attributes ?? {};
  for (const [k, v] of Object.entries(data)) {
    const val = v && typeof v === 'object' && 'value' in v ? v.value : v;
    const m = /^led([0-3])$/.exec(k);
    if (m) {
      const ch = Number(m[1]);
      const b = asBool(val);
      if (obs.led[ch] !== b) console.log(`   · led${ch} → ${b}`);
      obs.led[ch] = b;
      obs.ledAt[ch] = Date.now();
    }
    if (k === 'cmd_result' && val != null) {
      try {
        const r = JSON.parse(val);
        obs.cmd.push({ ...r, at: Date.now(), raw: val });
        console.log(`   · cmd_result: ${val}`);
      } catch {
        console.log(`   · cmd_result (อ่านไม่ออก): ${val}`);
      }
    }
  }
}

async function postSwitch(channel, on) {
  const reqId = newReqId();
  const body = { scope: 'SHARED_SCOPE', attributes: { cmd: { action: 'setSwitch', reqId, channel, on } } };
  const sentAt = Date.now();
  const res = await fetch(`${apiBase}/devices/${deviceId}/attributes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify(body),
  });
  return { reqId, sentAt, status: res.status, body };
}

/** รอ cmd_result ที่ reqId ตรง · คืน { result, elapsed } หรือ { timeout:true } ที่ 15 วิ */
async function waitCmdResult(reqId, sentAt) {
  const deadline = sentAt + RESULT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const hit = obs.cmd.find((c) => c.reqId === reqId);
    if (hit) return { result: hit, elapsed: hit.at - sentAt };
    await sleep(120);
  }
  return { timeout: true };
}

/** รอ led{ch} = want (หลัง sentAt) · คืน { elapsed } หรือ { timeout:true } */
async function waitLed(channel, want, sentAt) {
  const deadline = sentAt + LED_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (obs.led[channel] === want && obs.ledAt[channel] >= sentAt) {
      return { elapsed: obs.ledAt[channel] - sentAt };
    }
    await sleep(200);
  }
  return { timeout: true, current: obs.led[channel] };
}

/** ทดสอบสั่ง 1 ทิศทาง แล้วรายงานผลชั้นข้อมูลครบ */
async function testDirection(channel, on) {
  const label = `ch${channel} → ${on ? 'ON' : 'OFF'}`;
  console.log(`\n▶ ${label}`);
  const sent = await postSwitch(channel, on);
  console.log(`   POST ${sent.status} · reqId=${sent.reqId} · payload=${JSON.stringify(sent.body.attributes.cmd)}`);
  if (sent.status < 200 || sent.status >= 300) {
    console.log(`   ${NO} POST ไม่ใช่ 2xx — หยุด (อาจ token หมด/route ผิด)`);
    return { channel, on, ok: false, note: 'post-failed' };
  }

  const cr = await waitCmdResult(sent.reqId, sent.sentAt);
  if (cr.timeout) {
    console.log(`   ${NO} ไม่มี cmd_result ที่ reqId ตรง ใน 15 วิ → ต้องขึ้น "ไม่ทราบผล"`);
    return { channel, on, ok: false, note: 'no-cmd_result-15s' };
  }
  const reqMatch = cr.result.reqId === sent.reqId;
  console.log(
    `   ${reqMatch ? OK : NO} cmd_result ใน ${cr.elapsed}ms · ok=${cr.result.ok}` +
      (cr.result.partial ? ` · ⚠️ partial (published ${cr.result.publishedCount})` : '') +
      (cr.result.error ? ` · error="${cr.result.error}"` : '') +
      ` · reqId ${reqMatch ? 'ตรง' : 'ไม่ตรง!'}`,
  );

  const led = await waitLed(channel, on, sent.sentAt);
  if (led.timeout) {
    console.log(
      `   ${NO} led${channel} ไม่เปลี่ยนเป็น ${on} ใน ${LED_TIMEOUT_MS / 1000} วิ (ค่าล่าสุด=${led.current})` +
        ` — อาจถูก automation ทับ (guide §6.1) หรือ relay ไม่ตอบ`,
    );
  } else {
    console.log(`   ${OK} led${channel} = ${on} จริง หลังส่ง ${led.elapsed}ms`);
    if (cr.result.at && led.elapsed !== undefined) {
      const gap = obs.ledAt[channel] - cr.result.at;
      console.log(
        `   → ลำดับถูกต้อง: cmd_result มาก่อน led ${gap >= 0 ? gap + 'ms' : '(led มาก่อน?!)'} ` +
          `(UI ต้องโชว์ "ส่งคำสั่งแล้ว" ช่วงนี้ ยังไม่ใช่ "เปิดแล้ว")`,
      );
    }
  }
  return {
    channel,
    on,
    ok: reqMatch && !cr.timeout && !led.timeout,
    cmdMs: cr.elapsed,
    ledMs: led.elapsed,
    reqMatch,
    ledTimeout: !!led.timeout,
  };
}

let TOKEN = '';

async function main() {
  if (!supabaseUrl || !anonKey) die('ต้องมี VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY');
  if (!email || !password) die('ต้องตั้ง SYNEXTA_EMAIL + SYNEXTA_PASSWORD (ดู get-token.cjs)');
  if (!wsUrl || !deviceId || !orgId) die('ต้องมี VITE_WS_URL + VITE_FARM_DEVICE_ID + VITE_FARM_ORG_ID');

  console.log('🔴 สคริปต์นี้จะสั่งพัดลมจริง (ch ' + channels.join(',') + ') เปิดแล้วปิดคืน');
  console.log('   backend:', apiBase, '· device:', deviceId, '\n');

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  console.log('กำลังล็อกอิน…');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) die('ล็อกอินไม่ผ่าน: ' + error.message);
  TOKEN = data.session?.access_token || '';
  if (!TOKEN) die('ล็อกอินผ่านแต่ไม่มี session');
  console.log(OK, 'ได้ token แล้ว\n');

  const { io } = require('socket.io-client');
  const url = wsUrl.replace(/\/telemetry$/, '') + '/telemetry';
  const sock = io(url, { auth: { token: TOKEN }, reconnection: false });

  const ready = new Promise((resolve, reject) => {
    sock.on('connected', () => {
      console.log(OK, 'socket auth ผ่าน · subscribe (led0-2 + cmd_result)…');
      // ขอ attribute led0-2 (SHARED_SCOPE) + ไม่ระบุ telemetry keys เพื่อรับ cmd_result ด้วย
      sock.emit('subscribe_telemetry', {
        deviceId,
        orgId,
        attributeKeys: ['led0', 'led1', 'led2'],
        attributeScope: 'SHARED_SCOPE',
      });
      resolve();
    });
    sock.on('connect_error', (e) => reject(new Error('ต่อ socket ไม่ได้: ' + e.message)));
    sock.on('error', (e) => reject(new Error('socket error: ' + JSON.stringify(e))));
    setTimeout(() => reject(new Error('ไม่ได้ event connected ใน 15 วิ')), 15_000);
  });

  sock.on('subscribed', (e) => console.log('subscribed:', JSON.stringify(e)));
  sock.on('subscription_error', (e) => console.log(NO, 'subscription_error:', JSON.stringify(e)));
  sock.on('telemetry_data', ingest);
  sock.on('attribute_data', ingest);

  await ready;
  console.log('รอค่า led ตั้งต้น 4 วิ…');
  await sleep(4000);
  console.log('   led ตั้งต้น:', JSON.stringify(obs.led), '\n');

  const results = [];
  for (const ch of channels) {
    results.push(await testDirection(ch, true)); // เปิด
    await sleep(SETTLE_MS);
    results.push(await testDirection(ch, false)); // ปิดคืน (พักที่ off)
    await sleep(SETTLE_MS);
  }

  // ── สรุป ──
  console.log('\n════════ สรุปผล ════════');
  for (const r of results) {
    const dir = r.on ? 'ON ' : 'OFF';
    console.log(
      ` ch${r.channel} ${dir}: ` +
        (r.ok
          ? `${OK} ผ่าน (cmd ${r.cmdMs}ms · led ${r.ledMs}ms)`
          : `${NO} ${r.note ?? (r.ledTimeout ? 'led ไม่เปลี่ยน/ถูก automation ทับ' : 'ไม่ผ่าน')}`),
    );
  }

  console.log('\n── ต้องตรวจบน UI เอง (สคริปต์ตรวจไม่ได้) ──');
  console.log(' [1.2] กดสวิตช์บนเว็บ (login แล้ว) → ต้องเห็น "ส่งคำสั่งแล้ว/รอผล" ตอน cmd_result มา');
  console.log('       และปุ่ม **ยังไม่เปลี่ยนเป็น "เปิดแล้ว"** จนกว่า led จะเปลี่ยนจริง');
  console.log(' [1.3] timeout: ใน DevTools ตั้ง Network = Offline ทันทีหลังกด → ต้องขึ้น "ไม่ทราบผล" ใน 15 วิ');
  console.log(' [1.4] ช่องที่มี automation (temp/ตารางเวลา) → ต้องเห็นป้าย "อาจถูกทับ" บนการ์ด');

  // เก็บกวาด: unsubscribe ก่อน disconnect + signOut
  if (sock.connected) sock.emit('unsubscribe_telemetry', { deviceId });
  await sleep(400);
  sock.removeAllListeners();
  sock.disconnect();
  await supabase.auth.signOut();
  console.log('\nปิดการเชื่อมต่อแล้ว · เอาผลข้างบนไปแปะใน docs/MIGRATION.md');
}

main().catch((e) => die(String(e?.stack ?? e?.message ?? e)));
