#!/usr/bin/env node
/* เช็คว่า socket ต่อด้วย transport อะไรจริง (websocket / polling) — read-only
 *   node scripts/check-transport.cjs
 */
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
  const url = pick('VITE_WS_URL').replace(/\/+$/, '').replace(/\/telemetry$/, '') + '/telemetry';
  // ใช้ transports ชุดเดียวกับแอปจริง (websocket ก่อน)
  const sock = io(url, { auth: { token: data.session.access_token }, transports: ['websocket', 'polling'], reconnection: false });
  const eng = () => sock.io?.engine?.transport?.name ?? '(ยังไม่ต่อ)';
  sock.io?.engine?.on?.('upgrade', (t) => console.log('  ⤴ upgrade →', t.name));
  await new Promise((res, rej) => {
    sock.on('connect', () => { console.log('✓ connect · transport เริ่มต้น =', eng()); res(); });
    sock.on('connect_error', (e) => rej(new Error('connect_error: ' + e.message)));
    setTimeout(() => rej(new Error('timeout 15s')), 15000);
  });
  await sleep(2500);
  console.log('→ transport ที่ใช้จริงตอนนี้ =', eng());
  console.log('  (websocket = ต่อ realtime เต็มตัว · polling = long-polling ทุก ~ไม่กี่วินาที)');
  sock.disconnect(); await supabase.auth.signOut();
}
main().catch((e) => die(String(e?.stack ?? e?.message ?? e)));
