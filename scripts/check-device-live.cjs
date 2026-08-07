#!/usr/bin/env node
/* เช็คว่าอุปกรณ์ยัง "สด" ไหม (read-only) — เทียบ shadow_ts (เวลาที่อุปกรณ์เขียนล่าสุด) กับตอนนี้
 * ถ้า shadow_ts เก่ามาก = อุปกรณ์ออฟไลน์ → led ที่อ่านได้เป็นค่าค้าง */
const fs = require('node:fs'), path = require('node:path');
const WEB = path.join(__dirname, '..', 'packages', 'web');
const env = {};
for (const n of ['.env', '.env.local']) { const p = path.join(WEB, n); if (!fs.existsSync(p)) continue; for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$/); if (m && !l.trimStart().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } }
const pick = (k) => process.env[k] ?? env[k] ?? '';
const die = (m) => { console.error('✗ ' + m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(pick('VITE_SUPABASE_URL').replace(/\/+$/, ''), pick('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email: pick('SYNEXTA_EMAIL'), password: pick('SYNEXTA_PASSWORD') });
  if (error) die('login: ' + error.message);
  const { io } = require('socket.io-client');
  const sock = io(pick('VITE_WS_URL').replace(/\/+$/, '').replace(/\/telemetry$/, '') + '/telemetry', { auth: { token: data.session.access_token }, reconnection: false });
  const attrs = {};
  const ingest = (e) => { const d = e?.data ?? e?.attributes ?? {}; for (const [k, v] of Object.entries(d)) attrs[k] = v && typeof v === 'object' && 'value' in v ? v.value : v; };
  await new Promise((res, rej) => { sock.on('connected', () => { sock.emit('subscribe_telemetry', { deviceId: pick('VITE_FARM_DEVICE_ID'), orgId: pick('VITE_FARM_ORG_ID'), attributeKeys: ['led0', 'led1', 'led2', 'shadow_ts'], attributeScope: 'SHARED_SCOPE' }); res(); }); sock.on('connect_error', rej); setTimeout(() => rej(new Error('timeout')), 15000); });
  sock.on('telemetry_data', ingest); sock.on('attribute_data', ingest);
  await sleep(6000);
  const now = Date.now();
  const shadow = Number(attrs['shadow_ts']);
  const ageSec = Number.isFinite(shadow) ? Math.round((now - shadow) / 1000) : null;
  console.log('เวลาตอนนี้      :', new Date(now).toISOString());
  console.log('shadow_ts (raw) :', attrs['shadow_ts']);
  console.log('อุปกรณ์เขียนล่าสุด:', Number.isFinite(shadow) ? new Date(shadow).toISOString() : '(อ่านไม่ได้)');
  console.log('อายุค่า         :', ageSec === null ? '?' : ageSec + ' วินาทีที่แล้ว', ageSec !== null && ageSec > 60 ? '  🔴 เก่าเกิน 60 วิ = อุปกรณ์น่าจะออฟไลน์ · led เป็นค่าค้าง' : ageSec !== null ? '  ✓ สด' : '');
  console.log('led0/1/2        :', attrs['led0'], '/', attrs['led1'], '/', attrs['led2']);
  sock.emit('unsubscribe_telemetry', { deviceId: pick('VITE_FARM_DEVICE_ID') });
  await sleep(300); sock.disconnect(); await supabase.auth.signOut();
}
main().catch((e) => die(String(e?.stack ?? e?.message ?? e)));
