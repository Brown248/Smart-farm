#!/usr/bin/env node
/* เฝ้าดูค่าที่อุปกรณ์ส่งมา "ทีละช่วง" (read-only) — timeline ทุก event + สรุปจังหวะ/การขยับ
 *   node scripts/watch-stream.cjs [วินาที]   (ดีฟอลต์ 35)
 */
const fs = require('node:fs'), path = require('node:path');
const WEB = path.join(__dirname, '..', 'packages', 'web');
const env = {};
for (const n of ['.env', '.env.local']) { const p = path.join(WEB, n); if (!fs.existsSync(p)) continue; for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$/); if (m && !l.trimStart().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } }
const pick = (k) => process.env[k] ?? env[k] ?? '';
const die = (m) => { console.error('✗ ' + m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SECS = Number(process.argv[2]) || 35;

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(pick('VITE_SUPABASE_URL').replace(/\/+$/, ''), pick('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email: pick('SYNEXTA_EMAIL'), password: pick('SYNEXTA_PASSWORD') });
  if (error) die('login: ' + error.message);
  console.log('✓ login · เฝ้าดู ' + SECS + ' วิ\n');
  const { io } = require('socket.io-client');
  const sock = io(pick('VITE_WS_URL').replace(/\/+$/, '').replace(/\/telemetry$/, '') + '/telemetry', { auth: { token: data.session.access_token }, reconnection: false });
  const t0 = Date.now();
  const rel = () => ('+' + ((Date.now() - t0) / 1000).toFixed(1) + 's').padStart(7);

  const attrKeys = [];
  for (let c = 0; c <= 2; c++) { attrKeys.push('led' + c, 'min_temp' + c, 'max_temp' + c); }
  attrKeys.push('shadow_ts');

  const val = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v);
  const arrivals = { telemetry_data: [], attribute_data: [] };
  const lastLed = {};

  const onEvt = (tag) => (evt) => {
    const d = evt?.data ?? evt?.attributes ?? {};
    const keys = Object.keys(d);
    arrivals[tag].push(Date.now() - t0);
    // ดึงค่าที่สนใจ
    const pieces = [];
    for (const k of ['temperature', 'humidity', 'soil_moisture', 'light']) if (k in d) pieces.push(`${k.slice(0, 4)}=${val(d[k])}`);
    for (const c of [0, 1, 2]) if (('led' + c) in d) { const b = String(val(d['led' + c])); pieces.push(`led${c}=${b}${lastLed[c] !== undefined && lastLed[c] !== b ? '⚠เปลี่ยน' : ''}`); lastLed[c] = b; }
    if ('shadow_ts' in d) { const s = Number(val(d['shadow_ts'])); pieces.push(`shadow=${Number.isFinite(s) ? new Date(s).toISOString().slice(11, 19) : val(d['shadow_ts'])}`); }
    if ('cmd_result' in d) pieces.push(`cmd_result=${val(d['cmd_result'])}`);
    console.log(`[${rel()}] ${tag.padEnd(15)} keys:${String(keys.length).padStart(2)}  ${pieces.join('  ')}`);
  };

  await new Promise((res, rej) => {
    sock.on('connected', () => { sock.emit('subscribe_telemetry', { deviceId: pick('VITE_FARM_DEVICE_ID'), orgId: pick('VITE_FARM_ORG_ID'), attributeKeys: attrKeys, attributeScope: 'SHARED_SCOPE' }); res(); });
    sock.on('connect_error', rej); setTimeout(() => rej(new Error('timeout')), 15000);
  });
  sock.on('telemetry_data', onEvt('telemetry_data'));
  sock.on('attribute_data', onEvt('attribute_data'));
  sock.on('attribute_update', onEvt('attribute_update'));

  await sleep(SECS * 1000);

  const gaps = (a) => a.slice(1).map((x, i) => ((x - a[i]) / 1000).toFixed(1));
  console.log('\n── สรุปจังหวะการส่ง ──');
  for (const tag of ['telemetry_data', 'attribute_data']) {
    const a = arrivals[tag];
    console.log(`  ${tag}: ${a.length} ครั้ง` + (a.length > 1 ? ` · ห่างกัน(วิ): ${gaps(a).join(', ')}` : a.length === 1 ? ' (มาครั้งเดียว)' : ' (ไม่มาเลย)'));
  }
  console.log('  led ล่าสุด:', JSON.stringify(lastLed));

  if (sock.connected) sock.emit('unsubscribe_telemetry', { deviceId: pick('VITE_FARM_DEVICE_ID') });
  await sleep(300); sock.disconnect(); await supabase.auth.signOut();
}
main().catch((e) => die(String(e?.stack ?? e?.message ?? e)));
