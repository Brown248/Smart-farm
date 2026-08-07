#!/usr/bin/env node
/* อ่าน led0-3 จากหลาย scope (read-only) — หาว่าสถานะจริงของ ch0 อยู่ scope ไหน + ดู led0 ค้างไหม
 *   node scripts/check-scopes.cjs
 */
const fs = require('node:fs'), path = require('node:path');
const WEB = path.join(__dirname, '..', 'packages', 'web');
const env = {};
for (const n of ['.env', '.env.local']) { const p = path.join(WEB, n); if (!fs.existsSync(p)) continue; for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$/); if (m && !l.trimStart().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } }
const pick = (k) => process.env[k] ?? env[k] ?? '';
const die = (m) => { console.error('✗ ' + m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const val = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v);
const SCOPES = ['SHARED_SCOPE', 'SERVER_SCOPE', 'CLIENT_SCOPE'];
const keys = ['led0', 'led1', 'led2', 'led3', 'sw0', 'sw1', 'switch0', 'switch1', 'shadow_ts'];

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(pick('VITE_SUPABASE_URL').replace(/\/+$/, ''), pick('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email: pick('SYNEXTA_EMAIL'), password: pick('SYNEXTA_PASSWORD') });
  if (error) die('login: ' + error.message);
  const { io } = require('socket.io-client');
  const base = pick('VITE_WS_URL').replace(/\/+$/, '').replace(/\/telemetry$/, '') + '/telemetry';
  const dev = pick('VITE_FARM_DEVICE_ID'), org = pick('VITE_FARM_ORG_ID');

  for (const scope of SCOPES) {
    const sock = io(base, { auth: { token: data.session.access_token }, reconnection: false });
    const got = {};
    try {
      await new Promise((res, rej) => {
        sock.on('connected', () => { sock.emit('subscribe_telemetry', { deviceId: dev, orgId: org, attributeKeys: keys, attributeScope: scope }); res(); });
        sock.on('connect_error', rej); setTimeout(() => rej(new Error('timeout')), 12000);
      });
      sock.on('attribute_data', (e) => { const d = e?.data ?? e?.attributes ?? {}; for (const [k, v] of Object.entries(d)) got[k] = val(v); });
      sock.on('subscription_error', (e) => { got.__err = JSON.stringify(e); });
      await sleep(4000);
    } catch (e) { got.__err = String(e?.message ?? e); }
    const keyList = Object.keys(got).filter((k) => k !== '__err');
    console.log(`\n── ${scope} ──`);
    if (got.__err) console.log('  error:', got.__err);
    if (!keyList.length) console.log('  (ไม่มี key ส่งมา)');
    for (const k of keyList.sort()) console.log(`  ${k.padEnd(12)} = ${got[k]}`);
    if (sock.connected) sock.emit('unsubscribe_telemetry', { deviceId: dev });
    await sleep(200); sock.disconnect();
  }
  await supabase.auth.signOut();
}
main().catch((e) => die(String(e?.stack ?? e?.message ?? e)));
