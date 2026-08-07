#!/usr/bin/env node
/*
 * ⭐ Smoke-test `setThreshold` กับ backend จริง
 *
 *   npm run smoke:threshold              # ch3 (test) — ยืนยัน command path (cmd_result) เท่านั้น
 *   npm run smoke:threshold -- --real 2  # ch2 (พัดลมเล็กจริง) — ยืนยัน "อุปกรณ์ apply จริง" ด้วย
 *                                        #   อ่านค่าเดิม → ตั้งค่าทดสอบ → **คืนค่าเดิมอัตโนมัติ**
 *
 * ⚠️ ch3 ไม่มีอุปกรณ์จริง → attribute `min_temp3` ไม่มีวันเปลี่ยน (ไม่มี device อ่าน/เขียนกลับ · guide §7)
 *    บน ch3 จึงพิสูจน์ได้แค่ **cmd_result ok** (rule chain รับคำสั่ง) · การ apply จริงต้องดูที่ channel จริง
 * 🔴 --real จะเปลี่ยนเกณฑ์ automation ของพัดลมจริงชั่วคราวแล้วคืนค่าเดิม — รันตอนพร้อมรับผลจริง
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
const apiBase = wsUrl + '/api/v1';

// --real N ใช้ channel จริง (0-2) · ไม่งั้น default ch3 (test)
const realIdx = process.argv.indexOf('--real');
const REAL = realIdx !== -1;
const CH = REAL ? Number(process.argv[realIdx + 1]) : 3;
if (REAL && ![0, 1, 2].includes(CH)) die('--real ต้องเป็น 0, 1 หรือ 2 (พัดลมจริง)');

const OK = '✓';
const NO = '✗';
const INFO = 'ℹ';
function die(m) {
  console.error('✗ ' + m);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newReqId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const K = (kind, mm) => `${mm}_${kind}${CH}`; // เช่น min_temp2

const obs = { attr: {}, attrAt: {}, cmd: [] };
function ingest(evt) {
  const data = evt?.data ?? evt?.attributes ?? {};
  for (const [k, v] of Object.entries(data)) {
    const val = v && typeof v === 'object' && 'value' in v ? v.value : v;
    if (new RegExp(`^(min|max)_(temp|soil)${CH}$`).test(k)) {
      if (obs.attr[k] !== val) console.log(`   · ${k} → ${val}`);
      obs.attr[k] = val;
      obs.attrAt[k] = Date.now();
    }
    if (k === 'cmd_result' && val != null) {
      try {
        obs.cmd.push({ ...JSON.parse(val), at: Date.now() });
        console.log(`   · cmd_result: ${val}`);
      } catch {
        /* ไม่ใช่ JSON */
      }
    }
  }
}

let TOKEN = '';
async function postCmd(cmd) {
  const reqId = newReqId();
  const sentAt = Date.now();
  const res = await fetch(`${apiBase}/devices/${deviceId}/attributes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify({ scope: 'SHARED_SCOPE', attributes: { cmd: { ...cmd, reqId } } }),
  });
  return { reqId, sentAt, status: res.status };
}
async function waitCmd(reqId, sentAt, ms = 15000) {
  while (Date.now() < sentAt + ms) {
    const hit = obs.cmd.find((c) => c.reqId === reqId);
    if (hit) return { result: hit, elapsed: hit.at - sentAt };
    await sleep(120);
  }
  return { timeout: true };
}
async function waitAttr(key, want, sentAt, ms = 12000) {
  while (Date.now() < sentAt + ms) {
    if (String(obs.attr[key]) === String(want) && (obs.attrAt[key] ?? 0) >= sentAt)
      return { elapsed: (obs.attrAt[key] ?? 0) - sentAt };
    await sleep(200);
  }
  return { timeout: true, current: obs.attr[key] };
}

/** ส่งคำสั่ง + ยืนยัน cmd_result · (โหมด --real) ยืนยัน attribute เปลี่ยนจริงด้วย */
async function step(label, cmd, checks) {
  console.log(`\n▶ ${label}`);
  const sent = await postCmd(cmd);
  console.log(`   POST ${sent.status} · reqId=${sent.reqId} · ${JSON.stringify(cmd)}`);
  const cr = await waitCmd(sent.reqId, sent.sentAt);
  if (cr.timeout) {
    console.log(`   ${NO} ไม่มี cmd_result ใน 15 วิ`);
    return false;
  }
  const match = cr.result.reqId === sent.reqId;
  console.log(
    `   ${match ? OK : NO} cmd_result ${cr.elapsed}ms · ok=${cr.result.ok}` +
      (cr.result.partial ? ` · ⚠️ partial (${cr.result.publishedCount})` : '') +
      (cr.result.error ? ` · error="${cr.result.error}"` : ''),
  );
  let pass = match && cr.result.ok && !cr.result.partial;

  if (!REAL) {
    // ch3 ไม่มีอุปกรณ์จริง → attribute ไม่สะท้อน (คาดไว้แล้ว) · ไม่ถือเป็นข้อผิดพลาด
    console.log(`   ${INFO} ch3 ไม่มีอุปกรณ์จริง — attribute ไม่สะท้อนค่า (คาดไว้แล้ว) · ผ่าน = cmd_result ok`);
    return pass;
  }
  for (const [key, want] of Object.entries(checks)) {
    const a = await waitAttr(key, want, sent.sentAt);
    if (a.timeout) {
      console.log(`   ${NO} ${key} ไม่เป็น ${want} ใน 12 วิ (ล่าสุด=${a.current}) — อุปกรณ์ไม่ได้ apply?`);
      pass = false;
    } else {
      console.log(`   ${OK} ${key} = ${want} จริง (+${a.elapsed}ms) — อุปกรณ์ apply แล้ว`);
    }
  }
  return pass;
}

async function main() {
  if (!supabaseUrl || !anonKey || !email || !password) die('ต้องมี Supabase env + SYNEXTA_EMAIL/PASSWORD');
  if (!wsUrl || !deviceId || !orgId) die('ต้องมี VITE_WS_URL/DEVICE_ID/ORG_ID');

  console.log(
    REAL
      ? `🔴 setThreshold smoke-test บน channel ${CH} (พัดลมจริง) — จะเปลี่ยนเกณฑ์ชั่วคราวแล้วคืนค่าเดิม`
      : 'setThreshold smoke-test บน channel 3 (test · ไม่มีอุปกรณ์จริง)',
  );
  console.log('backend:', apiBase, '\n');

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  console.log('กำลังล็อกอิน…');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) die('ล็อกอินไม่ผ่าน: ' + error.message);
  TOKEN = data.session?.access_token || '';
  if (!TOKEN) die('ไม่มี session');
  console.log(OK, 'ได้ token\n');

  const { io } = require('socket.io-client');
  const url = wsUrl.replace(/\/telemetry$/, '') + '/telemetry';
  const sock = io(url, { auth: { token: TOKEN }, reconnection: false });
  const attrKeys = [K('temp', 'min'), K('temp', 'max'), K('soil', 'min'), K('soil', 'max')];
  await new Promise((res, rej) => {
    sock.on('connected', () => {
      console.log(OK, `auth ผ่าน · subscribe (เกณฑ์ ch${CH} + cmd_result)…`);
      sock.emit('subscribe_telemetry', {
        deviceId,
        orgId,
        attributeKeys: attrKeys,
        attributeScope: 'SHARED_SCOPE',
      });
      res();
    });
    sock.on('connect_error', (e) => rej(new Error('ต่อไม่ได้: ' + e.message)));
    setTimeout(() => rej(new Error('ไม่ได้ connected ใน 15 วิ')), 15000);
  });
  sock.on('subscribed', (e) => console.log('subscribed:', JSON.stringify(e)));
  sock.on('subscription_error', (e) => console.log(NO, 'subscription_error:', JSON.stringify(e)));
  sock.on('telemetry_data', ingest);
  sock.on('attribute_data', ingest);

  await sleep(4000);
  const baseline = { ...obs.attr };
  console.log(`เกณฑ์ ch${CH} ตั้งต้น:`, JSON.stringify(baseline), '\n');

  const results = [];
  // 1) auto: ตั้ง temp 28-33 · soil ปิด
  results.push([
    'auto temp 28-33',
    await step(
      'setThreshold auto (temp 28-33 · soil off)',
      {
        action: 'setThreshold',
        channel: CH,
        mode: 'auto',
        temp: { enabled: true, min: 28, max: 33 },
        soil: { enabled: false },
      },
      { [K('temp', 'min')]: 28, [K('temp', 'max')]: 33 },
    ),
  ]);
  await sleep(1500);
  // 2) no-auto
  results.push([
    'no-auto',
    await step(
      'setThreshold no-auto (ปิด automation)',
      { action: 'setThreshold', channel: CH, mode: 'no-auto' },
      { [K('temp', 'min')]: 0, [K('temp', 'max')]: 0 },
    ),
  ]);

  // 3) คืนค่าเดิม (เฉพาะ --real) — สำคัญมาก อย่าทิ้งพัดลมจริงไว้ในเกณฑ์ทดสอบ
  if (REAL) {
    const bMinT = Number(baseline[K('temp', 'min')] ?? 0);
    const bMaxT = Number(baseline[K('temp', 'max')] ?? 0);
    const bMinS = Number(baseline[K('soil', 'min')] ?? 0);
    const bMaxS = Number(baseline[K('soil', 'max')] ?? 0);
    const tempWasOn = !(bMinT === 0 && bMaxT === 0);
    const soilWasOn = !(bMinS === 0 && bMaxS === 0);
    const restore =
      tempWasOn || soilWasOn
        ? {
            action: 'setThreshold',
            channel: CH,
            mode: 'auto',
            temp: tempWasOn ? { enabled: true, min: bMinT, max: bMaxT } : { enabled: false },
            soil: soilWasOn ? { enabled: true, min: bMinS, max: bMaxS } : { enabled: false },
          }
        : { action: 'setThreshold', channel: CH, mode: 'no-auto' };
    console.log('\n🔁 คืนค่าเดิม…');
    const s = await postCmd(restore);
    const cr = await waitCmd(s.reqId, s.sentAt);
    console.log(
      `   POST ${s.status} · ${JSON.stringify(restore)}\n   ${cr.timeout ? NO + ' คืนค่าไม่สำเร็จ — ตรวจด้วยมือ!' : OK + ' คืนค่าเดิมแล้ว (cmd_result ok=' + cr.result?.ok + ')'}`,
    );
  }

  console.log('\n════════ สรุปผล ════════');
  for (const [label, ok] of results) console.log(` ${ok ? OK : NO} ${label}`);
  if (!REAL) {
    console.log(
      `\n${INFO} ch3 พิสูจน์ได้แค่ command path (cmd_result) — ยืนยัน "อุปกรณ์ apply จริง" ที่ channel จริง:`,
    );
    console.log('   npm run smoke:threshold -- --real 2   (พัดลมเล็ก · อ่าน→ตั้ง→คืนค่าเดิมอัตโนมัติ)');
  }

  if (sock.connected) sock.emit('unsubscribe_telemetry', { deviceId });
  await sleep(400);
  sock.removeAllListeners();
  sock.disconnect();
  await supabase.auth.signOut();
  console.log('\nปิดการเชื่อมต่อแล้ว · เอาผลไปแปะใน docs/MIGRATION.md');
}
main().catch((e) => die(String(e?.stack ?? e?.message ?? e)));
