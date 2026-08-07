#!/usr/bin/env node
/*
 * 🔍 อ่านสถานะจริงของอุปกรณ์ (read-only · **ไม่สั่งอะไรเลย**) เพื่อวินิจฉัยว่าอะไรสั่งเปิดพัดลม
 *
 *   npm run smoke:read
 *
 * ดึง: led0-2 · เกณฑ์ temp/soil · timer ทุก slot · อุณหภูมิจริง แล้วประเมินว่า
 * automation (temp / schedule) ตัวไหน "สั่งเปิด" อยู่ตอนนี้ (ตัวที่ทำให้กดปิดแล้วเด้งกลับ)
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
const pick = (k) => process.env[k] ?? fileEnv[k] ?? '';
const supabaseUrl = pick('VITE_SUPABASE_URL').replace(/\/+$/, '');
const anonKey = pick('VITE_SUPABASE_ANON_KEY');
const email = pick('SYNEXTA_EMAIL');
const password = pick('SYNEXTA_PASSWORD');
const wsUrl = pick('VITE_WS_URL').replace(/\/+$/, '');
const deviceId = pick('VITE_FARM_DEVICE_ID');
const orgId = pick('VITE_FARM_ORG_ID');

const die = (m) => {
  console.error('✗ ' + m);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const attrs = {};
let temperature = null;
function ingest(evt) {
  const data = evt?.data ?? evt?.attributes ?? {};
  for (const [k, v] of Object.entries(data)) {
    const val = v && typeof v === 'object' && 'value' in v ? v.value : v;
    attrs[k] = val;
    if (k === 'temperature') temperature = Number(val);
  }
}

/** ช่วงเวลาตอนนี้อยู่ในตาราง slot ที่ enable + วันนี้ติ๊ก ไหม */
function scheduleActive(timerRaw) {
  if (!timerRaw) return null;
  let o;
  try {
    o = JSON.parse(timerRaw);
  } catch {
    return null;
  }
  if (!o.enable) return { active: false, why: 'ปิดอยู่ (enable=false)' };
  const now = new Date();
  const dayIdx = (now.getDay() + 6) % 7; // mon=0
  const dayOn = o.days?.[DAYS[dayIdx]];
  const hhmmss = now.toTimeString().slice(0, 8);
  const inWindow = o.startTime && o.endTime && hhmmss >= o.startTime && hhmmss <= o.endTime;
  return {
    active: !!(dayOn && inWindow),
    why: `วันนี้(${DAYS[dayIdx]})=${dayOn} · ช่วง ${o.startTime}-${o.endTime} · ตอนนี้ ${hhmmss} · อยู่ในช่วง=${inWindow}`,
  };
}

async function main() {
  if (!supabaseUrl || !anonKey || !email || !password) die('ต้องมี Supabase env + SYNEXTA_EMAIL/PASSWORD');
  if (!wsUrl || !deviceId || !orgId) die('ต้องมี VITE_WS_URL/DEVICE_ID/ORG_ID');

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  console.log('กำลังล็อกอิน…');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) die('ล็อกอินไม่ผ่าน: ' + error.message);
  const token = data.session?.access_token;
  if (!token) die('ไม่มี session');
  console.log('✓ ได้ token\n');

  const { io } = require('socket.io-client');
  const url = wsUrl.replace(/\/telemetry$/, '') + '/telemetry';
  const sock = io(url, { auth: { token }, reconnection: false });

  const attrKeys = [];
  for (let c = 0; c <= 2; c++) {
    attrKeys.push(`led${c}`, `min_temp${c}`, `max_temp${c}`, `min_soil${c}`, `max_soil${c}`);
    for (let s = 0; s <= 2; s++) attrKeys.push(`timer${c}${s}`);
  }
  attrKeys.push('shadow_ts');

  await new Promise((res, rej) => {
    sock.on('connected', () => {
      console.log('✓ auth ผ่าน · subscribe…');
      sock.emit('subscribe_telemetry', { deviceId, orgId, attributeKeys: attrKeys, attributeScope: 'SHARED_SCOPE' });
      res();
    });
    sock.on('connect_error', (e) => rej(new Error('ต่อไม่ได้: ' + e.message)));
    setTimeout(() => rej(new Error('ไม่ได้ connected ใน 15 วิ')), 15000);
  });
  sock.on('subscription_error', (e) => console.log('✗ subscription_error:', JSON.stringify(e)));
  sock.on('telemetry_data', ingest);
  sock.on('attribute_data', ingest);

  console.log('รอค่า 6 วินาที…\n');
  await sleep(6000);

  console.log('อุณหภูมิจริง:', temperature ?? '(ยังไม่มา)', '°C\n');
  // ch0=ใหญ่#1(+เล็กพ่วง) · ch1=ใหญ่#2 · ch2=ปั๊ม (map ยืนยันแล้ว · เดิม label ch2 ผิดเป็นพัดลมเล็ก)
  const NAMES = ['พัดลมใหญ่ #1 (ch0, +เล็กพ่วง)', 'พัดลมใหญ่ #2 (ch1)', 'ปั๊มน้ำ (ch2)'];
  for (let c = 0; c <= 2; c++) {
    const led = attrs[`led${c}`];
    const minT = Number(attrs[`min_temp${c}`] ?? 0);
    const maxT = Number(attrs[`max_temp${c}`] ?? 0);
    const minS = Number(attrs[`min_soil${c}`] ?? 0);
    const maxS = Number(attrs[`max_soil${c}`] ?? 0);
    const tempOn = !(minT === 0 && maxT === 0);
    const soilOn = !(minS === 0 && maxS === 0);
    console.log(`── ${NAMES[c]} ──`);
    console.log(`   led${c} = ${led}`);
    console.log(
      `   เกณฑ์อุณหภูมิ: ${tempOn ? `เปิด (ปิด<${minT} · เปิด>${maxT})` : 'ปิด'}` +
        (tempOn && temperature !== null
          ? ` → ตอนนี้ ${temperature}°C ${temperature > maxT ? '**สูงกว่า max = สั่งเปิด**' : temperature < minT ? '(ต่ำกว่า min = สั่งปิด)' : '(อยู่ระหว่าง = คงเดิม)'}`
          : ''),
    );
    console.log(`   เกณฑ์ความชื้นดิน: ${soilOn ? `เปิด (เปิด<${minS} · ปิด>${maxS})` : 'ปิด'}`);
    for (let s = 0; s <= 2; s++) {
      const raw = attrs[`timer${c}${s}`];
      if (!raw) continue;
      const act = scheduleActive(raw);
      console.log(`   timer${c}${s}: ${raw}`);
      if (act) console.log(`      → ${act.active ? '**ตารางนี้สั่งเปิดอยู่ตอนนี้**' : 'ไม่ active'} · ${act.why}`);
    }
    console.log('');
  }
  console.log('สรุป: ช่องที่ led=true แต่ "เกณฑ์อุณหภูมิสั่งเปิด" หรือ "ตารางสั่งเปิด" = ตัวที่กดปิดแล้วเด้งกลับ');

  if (sock.connected) sock.emit('unsubscribe_telemetry', { deviceId });
  await sleep(400);
  sock.removeAllListeners();
  sock.disconnect();
  await supabase.auth.signOut();
}
main().catch((e) => die(String(e?.stack ?? e?.message ?? e)));
