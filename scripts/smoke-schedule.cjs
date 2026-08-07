#!/usr/bin/env node
/*
 * ⭐ Smoke-test `setSchedule` กับ backend จริง — บน **channel 3 (test)** เท่านั้น
 *
 *   npm run smoke:schedule
 *
 * ทดสอบครบ 3 กรณีที่เสี่ยงสุด (guide §6.3):
 *   1) โหมด A (สร้าง/แก้): ส่ง days + startTime + endTime → cmd_result ok (+ created)
 *   2) โหมด B พัก: ส่ง `enable:false` **ไม่มี days** → ok (ไม่ลบตาราง)
 *   3) โหมด B เปิดใช้: ส่ง `enable:true` **ไม่มี days** → ok
 *
 * ⚠️ ทดสอบเฉพาะ ch3 (มี slot 0 ไว้ทดสอบ · ไม่กระทบพัดลมจริง) · ไม่ส่ง slot > 2 เด็ดขาด
 * 🔴 ไม่ทำโหมด --real อัตโนมัติ เพราะ setSchedule บน channel จริงเสี่ยงสร้าง/ลบ slot ถาวร —
 *    ถ้าจะทดสอบ channel จริง ทำด้วยมืออย่างระวัง (pause→resume slot ที่มีอยู่แล้วเท่านั้น)
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

const CH = 3;
const SLOT = 0;
const OK = '✓';
const NO = '✗';
const INFO = 'ℹ';
function die(m) {
  console.error('✗ ' + m);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newReqId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TIMER_KEY = `timer${CH}${SLOT}`;

const obs = { timer: null, cmd: [] };
function ingest(evt) {
  const data = evt?.data ?? evt?.attributes ?? {};
  for (const [k, v] of Object.entries(data)) {
    const val = v && typeof v === 'object' && 'value' in v ? v.value : v;
    if (k === TIMER_KEY) {
      if (obs.timer !== val) console.log(`   · ${k} → ${val}`);
      obs.timer = val;
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

async function step(label, cmd) {
  console.log(`\n▶ ${label}`);
  // เช็คกันพลาด: โหมด B (pause/resume) ต้องไม่มี days ในตัวสคริปต์ทดสอบเองด้วย
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
      (cr.result.created !== undefined ? ` · created=${cr.result.created}` : '') +
      (cr.result.error ? ` · error="${cr.result.error}"` : ''),
  );
  return match && cr.result.ok;
}

async function main() {
  if (!supabaseUrl || !anonKey || !email || !password) die('ต้องมี Supabase env + SYNEXTA_EMAIL/PASSWORD');
  if (!wsUrl || !deviceId || !orgId) die('ต้องมี VITE_WS_URL/DEVICE_ID/ORG_ID');

  console.log(`setSchedule smoke-test บน channel ${CH} slot ${SLOT} (test · ไม่กระทบพัดลมจริง)`);
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
  await new Promise((res, rej) => {
    sock.on('connected', () => {
      console.log(OK, `auth ผ่าน · subscribe (${TIMER_KEY} + cmd_result)…`);
      sock.emit('subscribe_telemetry', {
        deviceId,
        orgId,
        attributeKeys: [TIMER_KEY],
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
  console.log(`${TIMER_KEY} ตั้งต้น:`, obs.timer ?? '(ยังไม่มา)', '\n');

  const results = [];
  // 1) โหมด A — สร้าง/แก้ (จ-ศ 06:00-06:30)
  results.push([
    'โหมด A · แก้วัน/เวลา',
    await step('setSchedule โหมด A (จ-ศ · 06:00-06:30)', {
      action: 'setSchedule',
      channel: CH,
      slot: SLOT,
      enable: true,
      days: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
      startTime: '06:00:00',
      endTime: '06:30:00',
    }),
  ]);
  await sleep(1500);
  // 2) โหมด B — พัก (ไม่มี days)
  results.push([
    'โหมด B · พัก (ไม่มี days)',
    await step('setSchedule โหมด B พัก (enable:false)', {
      action: 'setSchedule',
      channel: CH,
      slot: SLOT,
      enable: false,
    }),
  ]);
  await sleep(1500);
  // 3) โหมด B — เปิดใช้ (ไม่มี days)
  results.push([
    'โหมด B · เปิดใช้ (ไม่มี days)',
    await step('setSchedule โหมด B เปิดใช้ (enable:true)', {
      action: 'setSchedule',
      channel: CH,
      slot: SLOT,
      enable: true,
    }),
  ]);

  console.log('\n════════ สรุปผล ════════');
  for (const [label, ok] of results) console.log(` ${ok ? OK : NO} ${label}`);
  console.log(
    `\n${INFO} ch3 พิสูจน์ command path (cmd_result) · attribute ${TIMER_KEY} จะเปลี่ยนก็ต่อเมื่อ backend เก็บให้ ch3`,
  );

  if (sock.connected) sock.emit('unsubscribe_telemetry', { deviceId });
  await sleep(400);
  sock.removeAllListeners();
  sock.disconnect();
  await supabase.auth.signOut();
  console.log('\nปิดการเชื่อมต่อแล้ว · เอาผลไปแปะใน docs/MIGRATION.md');
}
main().catch((e) => die(String(e?.stack ?? e?.message ?? e)));
