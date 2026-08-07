#!/usr/bin/env node
/*
 * 🔴 map-probe — "กระพริบ" ช่องเดียวช้าๆ ให้คนยืนดูหน้างานระบุว่าช่องนั้น = พัดลมตัวไหน
 *   node scripts/map-probe.cjs 0     # ทดสอบ ch0 (ค่าเริ่มต้น)
 *   node scripts/map-probe.cjs 1     # ทดสอบ ch1
 * ลำดับ: อ่านค่าเริ่ม → OFF(10s) → ON(10s) → OFF(10s) → ON(ค้างไว้ = คงความเย็น)
 * แตะเฉพาะ ch0/ch1 (พัดลมใหญ่) เท่านั้น · ไม่แตะ ch2(ปั๊ม)/ch3(test)
 */
const fs = require('node:fs'), path = require('node:path');
const WEB = path.join(__dirname, '..', 'packages', 'web');
const env = {};
for (const n of ['.env', '.env.local']) { const p = path.join(WEB, n); if (!fs.existsSync(p)) continue; for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$/); if (m && !l.trimStart().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } }
const pick = (k) => process.env[k] ?? env[k] ?? '';
const die = (m) => { console.error('✗ ' + m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CH = Number(process.argv[2] ?? 0);
if (![0, 1].includes(CH)) die('ทดสอบได้เฉพาะ ch0 หรือ ch1 (พัดลมใหญ่)');

const wsUrl = pick('VITE_WS_URL').replace(/\/+$/, '');
const deviceId = pick('VITE_FARM_DEVICE_ID');
const apiBase = wsUrl + '/api/v1';
let TOKEN = '';
const led = { 0: null, 1: null, 2: null };

async function post(on) {
  const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const body = { scope: 'SHARED_SCOPE', attributes: { cmd: { action: 'setSwitch', reqId, channel: CH, on } } };
  const res = await fetch(`${apiBase}/devices/${deviceId}/attributes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(body),
  });
  const t = new Date().toLocaleTimeString('th-TH');
  console.log(`[${t}]  ▶ ch${CH} → ${on ? 'ON ' : 'OFF'}  (POST ${res.status})`);
}

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(pick('VITE_SUPABASE_URL').replace(/\/+$/, ''), pick('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email: pick('SYNEXTA_EMAIL'), password: pick('SYNEXTA_PASSWORD') });
  if (error) die('login: ' + error.message);
  TOKEN = data.session.access_token;
  const { io } = require('socket.io-client');
  const sock = io(wsUrl.replace(/\/telemetry$/, '') + '/telemetry', { auth: { token: TOKEN }, reconnection: false });
  await new Promise((res, rej) => {
    sock.on('connected', () => { sock.emit('subscribe_telemetry', { deviceId, orgId: pick('VITE_FARM_ORG_ID'), attributeKeys: ['led0', 'led1', 'led2'], attributeScope: 'SHARED_SCOPE' }); res(); });
    sock.on('connect_error', rej); setTimeout(() => rej(new Error('timeout')), 15000);
  });
  const ingest = (e) => { const d = e?.data ?? e?.attributes ?? {}; for (const [k, v] of Object.entries(d)) { const m = /^led([0-2])$/.exec(k); if (m) led[Number(m[1])] = String(v && typeof v === 'object' && 'value' in v ? v.value : v); } };
  sock.on('telemetry_data', ingest); sock.on('attribute_data', ingest);
  await sleep(3000);
  console.log(`\n🔴 กระพริบ ch${CH} — ดูว่าพัดลม "ตัวไหน" ขยับตาม (ค่าเริ่ม led=${JSON.stringify(led)})\n`);
  await post(false); await sleep(10000);
  await post(true);  await sleep(10000);
  await post(false); await sleep(10000);
  await post(true);  await sleep(6000);
  console.log(`\n✓ จบ · ปล่อย ch${CH} ไว้ที่ ON (คงความเย็น) · led ล่าสุด=${JSON.stringify(led)}`);
  console.log('   (led อาจมาช้าตามที่รู้กัน — ยึด "พัดลมตัวที่ขยับตาม" เป็นหลัก)');
  if (sock.connected) sock.emit('unsubscribe_telemetry', { deviceId });
  await sleep(300); sock.disconnect(); await supabase.auth.signOut();
}
main().catch((e) => die(String(e?.stack ?? e?.message ?? e)));
