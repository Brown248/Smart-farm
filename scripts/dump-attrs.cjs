#!/usr/bin/env node
/* dump attribute ทั้งหมดที่อุปกรณ์ส่งมา (read-only) — หาว่าค่าไหนคือสถานะสวิตช์จริง
 *   node scripts/dump-attrs.cjs
 */
const fs = require('node:fs'), path = require('node:path');
const WEB = path.join(__dirname, '..', 'packages', 'web');
const env = {};
for (const n of ['.env', '.env.local']) { const p = path.join(WEB, n); if (!fs.existsSync(p)) continue; for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$/); if (m && !l.trimStart().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } }
const pick = (k) => process.env[k] ?? env[k] ?? '';
const die = (m) => { console.error('✗ ' + m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ขอกว้างๆ เผื่อมี key อื่นที่สะท้อนสถานะสวิตช์จริง (นอกจาก led)
const keys = [];
for (let c = 0; c <= 3; c++) keys.push(`led${c}`, `sw${c}`, `switch${c}`, `relay${c}`, `out${c}`, `gpio${c}`, `state${c}`, `min_temp${c}`, `max_temp${c}`);
keys.push('shadow_ts', 'netpie_banned', 'netpie_status');

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(pick('VITE_SUPABASE_URL').replace(/\/+$/, ''), pick('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email: pick('SYNEXTA_EMAIL'), password: pick('SYNEXTA_PASSWORD') });
  if (error) die('login: ' + error.message);
  const { io } = require('socket.io-client');
  const sock = io(pick('VITE_WS_URL').replace(/\/+$/, '').replace(/\/telemetry$/, '') + '/telemetry', { auth: { token: data.session.access_token }, reconnection: false });
  const all = {};
  const grab = (tag) => (evt) => { const d = evt?.data ?? evt?.attributes ?? {}; for (const [k, v] of Object.entries(d)) all[k] = { value: v && typeof v === 'object' && 'value' in v ? v.value : v, via: tag }; };
  await new Promise((res, rej) => {
    sock.on('connected', () => { sock.emit('subscribe_telemetry', { deviceId: pick('VITE_FARM_DEVICE_ID'), orgId: pick('VITE_FARM_ORG_ID'), attributeKeys: keys, attributeScope: 'SHARED_SCOPE' }); res(); });
    sock.on('connect_error', rej); setTimeout(() => rej(new Error('timeout')), 15000);
  });
  sock.on('telemetry_data', grab('telemetry'));
  sock.on('attribute_data', grab('attribute'));
  sock.on('subscription_error', (e) => console.log('subscription_error:', JSON.stringify(e)));
  await sleep(7000);
  console.log('── ทุก key ที่อุปกรณ์ส่งมา ──');
  for (const k of Object.keys(all).sort()) console.log(`  ${k.padEnd(16)} = ${String(all[k].value).slice(0, 60).padEnd(24)} (${all[k].via})`);
  if (sock.connected) sock.emit('unsubscribe_telemetry', { deviceId: pick('VITE_FARM_DEVICE_ID') });
  await sleep(300); sock.disconnect(); await supabase.auth.signOut();
}
main().catch((e) => die(String(e?.stack ?? e?.message ?? e)));
