#!/usr/bin/env node
/*
 * 🔍 เฝ้าดูว่า attribute (led) ไหลเข้ามาแบบ "สด" ไหม หรือมาแค่ครั้งเดียวตอน subscribe (read-only)
 *   node scripts/watch-attrs.cjs
 * subscribe เหมือน provider จริงแล้ว log ทุก event 25 วิ · ดูว่า led0/1/2 ถูก push ซ้ำหรือมาหนเดียว
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
const env = readEnvFiles();
const pick = (k) => process.env[k] ?? env[k] ?? '';
const supabaseUrl = pick('VITE_SUPABASE_URL').replace(/\/+$/, '');
const anonKey = pick('VITE_SUPABASE_ANON_KEY');
const email = pick('SYNEXTA_EMAIL');
const password = pick('SYNEXTA_PASSWORD');
const wsUrl = pick('VITE_WS_URL').replace(/\/+$/, '');
const deviceId = pick('VITE_FARM_DEVICE_ID');
const orgId = pick('VITE_FARM_ORG_ID');
const die = (m) => { console.error('✗ ' + m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!supabaseUrl || !anonKey || !email || !password || !wsUrl || !deviceId || !orgId) die('env ไม่ครบ');
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) die('login: ' + error.message);
  const token = data.session?.access_token;
  console.log('✓ login\n');

  const { io } = require('socket.io-client');
  const url = wsUrl.replace(/\/telemetry$/, '') + '/telemetry';
  const sock = io(url, { auth: { token }, reconnection: false });
  const t0 = Date.now();
  const rel = () => '+' + ((Date.now() - t0) / 1000).toFixed(1) + 's';

  const attrKeys = [];
  for (let c = 0; c <= 2; c++) { attrKeys.push('led' + c, 'min_temp' + c, 'max_temp' + c); for (let s = 0; s <= 2; s++) attrKeys.push('timer' + c + s); }
  attrKeys.push('shadow_ts');

  const ledSeen = { led0: [], led1: [], led2: [] };
  const summarize = (tag, data) => {
    const d = data?.data ?? data?.attributes ?? data ?? {};
    const keys = Object.keys(d);
    const leds = keys.filter((k) => /^led[0-2]$/.test(k));
    for (const k of leds) {
      const v = d[k] && typeof d[k] === 'object' && 'value' in d[k] ? d[k].value : d[k];
      ledSeen[k].push(rel() + '=' + v);
    }
    console.log(`[${rel()}] ${tag} · keys(${keys.length}): ${keys.slice(0, 12).join(',')}${keys.length > 12 ? '…' : ''}${leds.length ? '  <<< led: ' + leds.join(',') : ''}`);
  };

  await new Promise((res, rej) => {
    sock.on('connected', () => {
      console.log('✓ connected · subscribe\n');
      sock.emit('subscribe_telemetry', { deviceId, orgId, attributeKeys: attrKeys, attributeScope: 'SHARED_SCOPE' });
      res();
    });
    sock.on('connect_error', (e) => rej(new Error(e.message)));
    setTimeout(() => rej(new Error('no connected in 15s')), 15000);
  });
  sock.on('telemetry_data', (d) => summarize('telemetry_data', d));
  sock.on('attribute_data', (d) => summarize('attribute_data', d));
  sock.on('attribute_update', (d) => summarize('attribute_update', d));
  sock.onAny((name) => { if (!['telemetry_data', 'attribute_data', 'attribute_update', 'connected'].includes(name)) console.log(`[${rel()}] (other event) ${name}`); });

  console.log('เฝ้าดู 25 วิ…\n');
  await sleep(25000);

  console.log('\n── สรุปการมาของ led (สำคัญ) ──');
  for (const k of ['led0', 'led1', 'led2']) console.log(`  ${k}: ${ledSeen[k].length} ครั้ง` + (ledSeen[k].length ? ' → ' + ledSeen[k].join(' , ') : ' → ไม่มาเลย'));
  console.log('\nถ้า led มา 1 ครั้ง (แค่ตอน subscribe) = backend ไม่ push การเปลี่ยนสด → ปุ่มจะไม่อัปเดตจนกว่าจะรีเฟรช');

  if (sock.connected) sock.emit('unsubscribe_telemetry', { deviceId });
  await sleep(300);
  sock.disconnect();
  await supabase.auth.signOut();
}
main().catch((e) => die(String(e?.stack ?? e?.message ?? e)));
