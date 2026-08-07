#!/usr/bin/env node
/*
 * ขอ access_token จาก Supabase แล้วตรวจให้ครบว่าจะอ่านค่าจริงได้หรือยัง
 *
 *   npm run token              # token + ไล่ตรวจ org/device/สิทธิ์ ผ่าน REST
 *   npm run token -- --ws      # + ลองต่อ WebSocket ว่าผ่าน auth ไหม
 *   npm run token -- --keys    # + subscribe แบบไม่ส่ง keys เพื่อดูชื่อ key จริง
 *   npm run token -- --no-check # เอาแค่ token ไม่ต้องตรวจอะไร
 *
 * **ทำไมต้องตรวจหลายชั้น** — ความพังแต่ละแบบให้อาการหน้าตาเหมือนกันหมด ("จอไม่มีค่าจริง")
 * แต่แก้คนละวิธีสิ้นเชิง: บัญชีผิด org · device id ใส่ผิดตัว · device ออฟไลน์ ·
 * ยังไม่มี key ลงทะเบียน สคริปต์นี้จึงไล่ทีละชั้นแล้วบอกว่าติดชั้นไหน
 *
 * ⚠️ **ห้าม hardcode อีเมล/รหัสผ่านลงไฟล์นี้** (กฎเหล็กข้อ 10)
 * สคริปต์ต้นฉบับที่ทีมส่งมามีรหัสผ่านฝังอยู่ 5 ชุด — ถ้าไฟล์แบบนั้นขึ้น repo
 * รหัสผ่านจะอยู่ในประวัติตลอดไป ลบทีหลังไม่หมด ตัวนี้จึงรับจาก env เท่านั้น
 *
 *   SYNEXTA_EMAIL=you@synexta.com SYNEXTA_PASSWORD=... npm run token
 *
 * หรือใส่ใน `packages/web/.env.local` (`.gitignore` ครอบ `.env*` ไว้หมดแล้ว)
 *
 * เป็นสคริปต์ CommonJS (.cjs) เพราะ root package.json เป็น `"type": "module"`
 */
const fs = require('node:fs');
const path = require('node:path');

const WEB = path.join(__dirname, '..', 'packages', 'web');

/**
 * อ่าน .env เอง ไม่พึ่ง dotenv — ไม่ได้เป็น dependency ของโปรเจกต์
 * และไม่คุ้มที่จะเพิ่มแค่เพื่อสคริปต์ตัวเดียว
 *
 * `.env.local` ทับ `.env` ตามลำดับของ Vite (ไฟล์เฉพาะเครื่องชนะไฟล์ที่แชร์กัน)
 */
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
/** env ของ process ชนะไฟล์ เพื่อให้สั่งครั้งเดียวแบบ `SYNEXTA_EMAIL=... npm run token` ได้ */
const pick = (key) => process.env[key] ?? fileEnv[key] ?? '';

const supabaseUrl = pick('VITE_SUPABASE_URL').replace(/\/+$/, '');
const anonKey = pick('VITE_SUPABASE_ANON_KEY');
const email = pick('SYNEXTA_EMAIL');
const password = pick('SYNEXTA_PASSWORD');

const wsUrl = pick('VITE_WS_URL').replace(/\/+$/, '');
const deviceId = pick('VITE_FARM_DEVICE_ID');
const orgId = pick('VITE_FARM_ORG_ID');

/**
 * REST ของ backend อยู่ใต้ `/api/v1` (ยืนยันจาก Swagger ที่ `/api/docs` · `/api/docs-json`)
 * ส่วน WebSocket เป็น **namespace** `/telemetry` บน origin เดียวกัน คนละชั้นกัน
 */
const apiBase = wsUrl + '/api/v1';

const wantWs = process.argv.includes('--ws') || process.argv.includes('--keys');
const wantKeys = process.argv.includes('--keys');
const wantCheck = !process.argv.includes('--no-check');

const die = (msg) => {
  console.error('✗ ' + msg);
  process.exit(1);
};

/** ปิดค่ากลางไว้ — ให้เห็นว่ามีค่าอยู่จริงและยาวเท่าไร แต่ไม่โชว์ทั้งก้อนบนจอ/ใน log */
const mask = (v) => (v ? `${v.slice(0, 6)}…${v.slice(-4)} (${v.length} ตัว)` : '(ว่าง)');

const OK = '✓';
const NO = '✗';
const HM = '!';

function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch {
    return null;
  }
}

/** ข้อสรุปที่ต้องทำต่อ — เก็บไว้พิมพ์รวมท้ายสุด ไม่ให้กระจายปนกับ log */
const todo = [];

async function api(token, p) {
  const r = await fetch(apiBase + p, { headers: { Authorization: 'Bearer ' + token } });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ไม่ใช่ JSON ก็ไม่เป็นไร เก็บ text ไว้ให้ดูแทน */
  }
  return { status: r.status, json, text };
}

/**
 * ไล่ตรวจตั้งแต่ backend ยอมรับ token → org ถูกไหม → device ถูกตัวไหม →
 * มีสิทธิ์อ่าน device นั้นไหม → device ออนไลน์ไหม → มี key อะไรลงทะเบียนไว้
 */
async function checkBackend(token) {
  console.log('── ตรวจกับ backend (' + apiBase + ') ──');

  const me = await api(token, '/users/me');
  if (me.status !== 200) {
    console.log(NO, 'backend ไม่รับ token นี้ —', me.status, me.text.slice(0, 160));
    todo.push(
      'backend ปฏิเสธ token — เช็กว่า VITE_SUPABASE_URL ตรงกับ Supabase ที่ backend เชื่อถือ',
    );
    return;
  }
  const u = me.json?.user ?? me.json ?? {};
  console.log(OK, 'backend รับ token —', u.email ?? '(ไม่ทราบอีเมล)', '·', u.name ?? '');

  /*
   * ── org: ต้องดู `access.organizations` จาก /users/me เท่านั้น ──
   *
   * ห้ามใช้ `GET /orgs` ตัดสิน — endpoint นั้น **ไม่กรองตามสิทธิ์** (คืนทุก org ในระบบ)
   * เคยทำให้สคริปต์นี้ขึ้น ✓ ทั้งที่บัญชีเข้า org นั้นไม่ได้เลย แล้วไปหาสาเหตุผิดทาง
   */
  const myOrgs = Array.isArray(me.json?.access?.organizations) ? me.json.access.organizations : [];
  console.log('     org ที่บัญชีนี้เป็นสมาชิก:');
  for (const o of myOrgs) {
    console.log('     -', o.id, '·', o.name, '· role', o.role);
  }
  const hitOrg = myOrgs.find((o) => o.id === orgId);
  if (hitOrg) {
    console.log(OK, 'VITE_FARM_ORG_ID = org ที่เป็นสมาชิก:', hitOrg.name, '· role', hitOrg.role);
    if (!(hitOrg.permissions ?? []).includes('iot.devices.view')) {
      console.log(NO, 'แต่ role นี้ไม่มี permission `iot.devices.view`');
      todo.push('บัญชีอยู่ใน org แล้วแต่ role ไม่มีสิทธิ์ iot.devices.view');
    }
  } else {
    console.log(NO, 'VITE_FARM_ORG_ID ไม่ใช่ org ที่บัญชีนี้เป็นสมาชิก');
    todo.push(
      'บัญชีนี้ไม่ได้เป็นสมาชิก org ' + orgId + ' — ขอบัญชีใน org นั้น หรือให้เพิ่มบัญชีนี้เข้าไป',
    );
  }

  // ── device ──
  const devs = await api(token, '/devices?limit=200');
  const devList = devs.json?.items ?? [];
  const total = devs.json?.total ?? devs.json?.meta?.total;
  // ห้ามตัดข้อมูลแบบเงียบ — ถ้าลิสต์ไม่ครบต้องบอก ไม่งั้นจะสรุปว่า "ไม่มี device นี้" ผิดๆ
  if (typeof total === 'number' && total > devList.length) {
    console.log(HM, `ดึง device มาแค่ ${devList.length} จาก ${total} ตัว — ผลตรวจอาจไม่ครบ`);
  }

  const byId = devList.find((d) => d.id === deviceId);
  const byTb = devList.find((d) => d.tbDeviceId === deviceId);

  if (!byId && byTb) {
    /*
     * กับดักที่เกิดขึ้นจริง: เอา `tbDeviceId` มาใส่แทน `id` ในระบบทีม
     * เอกสารเตือนไว้ตรงๆ แต่สองค่านี้เป็น UUID หน้าตาเหมือนกัน แยกด้วยตาไม่ออก
     */
    console.log(NO, 'VITE_FARM_DEVICE_ID เป็น **tbDeviceId** ไม่ใช่ id ในระบบทีม');
    console.log('     device นั้นชื่อ:', byTb.displayName || '(ไม่มีชื่อ)');
    console.log('     id ที่ถูกคือ  :', byTb.id);
    todo.push(`เปลี่ยน VITE_FARM_DEVICE_ID เป็น ${byTb.id} (ตอนนี้ใส่ tbDeviceId มา)`);
    return;
  }

  if (!byId) {
    console.log(NO, 'ไม่พบ device id นี้ในรายการที่บัญชีนี้เห็น (' + devList.length + ' ตัว)');
    const sameOrg = devList.filter((d) => d.organizationId === orgId);
    if (sameOrg.length > 0) {
      console.log('     device ใน org ที่ตั้งไว้:');
      for (const d of sameOrg.slice(0, 15)) {
        console.log('     -', d.id, '|', d.displayName || '(ไม่มีชื่อ)');
      }
      if (sameOrg.length > 15) console.log(`     … และอีก ${sameOrg.length - 15} ตัว`);
    }
    todo.push('VITE_FARM_DEVICE_ID ไม่อยู่ในรายการ — เลือกจาก device ข้างบน');
    return;
  }

  /*
   * เจอ device ในลิสต์ **ไม่ได้แปลว่ามีสิทธิ์อ่าน** — `GET /devices` ไม่กรองตาม org
   * (ยืนยันแล้ว: บัญชีที่อยู่ 1 org เห็น device ครบทั้ง 85 ตัวจาก 4 org)
   * ตัวตัดสินสิทธิ์คือ `/telemetry/data` ด้านล่าง
   */
  console.log(OK, 'device:', byId.displayName || '(ไม่มีชื่อ)', '· status', byId.status);
  console.log('     org ของ device:', byId.organizationId, '·', byId.organizationName);
  if (orgId && byId.organizationId !== orgId) {
    console.log(NO, 'device อยู่คนละ org กับ VITE_FARM_ORG_ID');
    todo.push(`VITE_FARM_ORG_ID ควรเป็น ${byId.organizationId} ให้ตรงกับ org ของ device`);
  }

  /*
   * ออนไลน์กับสิทธิ์เป็นสองเรื่องคนละอย่าง แต่ทั้งคู่ทำให้ "จอไม่มีค่า" เหมือนกัน
   * ต้องแยกให้เห็น ไม่งั้นจะไปแก้ผิดจุด
   */
  if (byId.isOnline === false) {
    console.log(NO, 'device ออฟไลน์ (isOnline: false) — ยังไม่ส่งค่าเข้ามา');
    todo.push('device ออฟไลน์ — ต้องให้ฝ่ายฮาร์ดแวร์เปิดให้ยิงข้อมูลก่อน จะได้ค่าจริง');
  } else if (byId.isOnline === true) {
    console.log(OK, 'device ออนไลน์');
  }

  const regKeys = Array.isArray(byId.telemetryKeys) ? byId.telemetryKeys : [];
  if (regKeys.length === 0) {
    console.log(HM, 'telemetryKeys ของ device ยังว่าง — ระบบยังไม่รู้ว่า device ส่ง key อะไร');
  } else {
    console.log(OK, 'telemetryKeys ที่ลงทะเบียนไว้ (' + regKeys.length + '):');
    for (const k of regKeys) console.log('     -', typeof k === 'string' ? k : JSON.stringify(k));
  }

  // ── สิทธิ์อ่านค่าของ device นี้ ──
  const probe = await api(token, `/telemetry/data/${deviceId}?keys=temperature`);
  if (probe.status === 403) {
    console.log(
      NO,
      'ไม่มีสิทธิ์อ่าน device นี้ —',
      probe.json?.message ?? probe.text.slice(0, 120),
    );
    todo.push('บัญชีนี้ไม่มีสิทธิ์ใน org ของ device — ขอบัญชีที่อยู่ใน org นั้น');
  } else if (probe.status === 200) {
    console.log(OK, 'อ่านค่าของ device นี้ได้ (REST ตอบ 200)');
  } else {
    console.log(HM, 'GET /telemetry/data ตอบ', probe.status, '·', probe.text.slice(0, 140));
  }
}

/** ต่อ socket จริงตามสเปก — `auth.token` ตอน handshake เท่านั้น */
function checkSocket(token) {
  const { io } = require('socket.io-client');
  const url = wsUrl.replace(/\/telemetry$/, '') + '/telemetry';
  console.log('\n── ตรวจ WebSocket (' + url + ') ──');

  return new Promise((resolve) => {
    const sock = io(url, { auth: { token }, reconnection: false });
    const seen = new Map();
    let done = false;
    /*
     * event `error` ตัวเดียวใช้ทั้ง auth ไม่ผ่านและ subscribe ไม่ผ่าน
     * ถ้า `connected` มาแล้วแปลว่า auth ผ่านแน่ — error หลังจากนั้นเป็นเรื่อง device/สิทธิ์
     * ไม่แยกให้ชัดจะไปแก้ผิดจุด (เสียเวลาไล่หา token ทั้งที่ปัญหาอยู่ที่สิทธิ์ org)
     */
    let authed = false;

    const finish = (note) => {
      if (done) return;
      done = true;
      if (note) console.log(note);
      if (seen.size > 0) {
        console.log('\nkey ที่ device ยิงมาจริง (' + seen.size + ' ตัว):');
        for (const [k, v] of [...seen].sort((a, b) => a[0].localeCompare(b[0]))) {
          console.log('   -', k.padEnd(24), '=', v);
        }
        console.log('\nเอาชื่อพวกนี้ไปเทียบกับ CLIMATE_KEY_RULES / SOIL_ALIASES');
        console.log('ใน packages/web/src/config/telemetryKeys.ts');
      }
      // unsubscribe ก่อน disconnect เสมอ ไม่งั้น backend เปิด WS ไป ThingsBoard ค้างไว้
      if (sock.connected) sock.emit('unsubscribe_telemetry', { deviceId });
      setTimeout(() => {
        sock.removeAllListeners();
        sock.disconnect();
        resolve();
      }, 500);
    };

    sock.on('connected', (e) => {
      authed = true;
      console.log(OK, 'auth ผ่าน:', JSON.stringify(e));
      if (!wantKeys) return finish(null);
      // ไม่ส่ง keys = ขอทุก key ที่ device ยิงมา (เอกสารข้อ 2)
      // `orgId` **บังคับ** — ไม่ส่งจะได้ `Failed to subscribe to device telemetry` (ทดสอบแล้ว)
      console.log('subscribe แบบไม่ระบุ keys · รอข้อมูล 30 วินาที…');
      sock.emit('subscribe_telemetry', { deviceId, orgId });
    });

    sock.on('subscribed', (e) => console.log('subscribed:', JSON.stringify(e)));
    sock.on('telemetry_data', (e) => {
      for (const [k, v] of Object.entries(e?.data ?? {})) {
        if (!seen.has(k)) console.log('   พบ key ใหม่:', k, '=', JSON.stringify(v));
        seen.set(k, v?.value ?? JSON.stringify(v));
      }
    });
    sock.on('subscription_error', (e) => console.log('subscription_error:', JSON.stringify(e)));
    sock.on('error', (e) => {
      if (authed) {
        todo.push(
          'subscribe ไม่ผ่าน (' +
            (e?.message ?? 'ไม่ทราบสาเหตุ') +
            ') — auth ผ่านแล้ว ปัญหาอยู่ที่สิทธิ์ใน device/org นี้',
        );
        finish(NO + ' subscribe ไม่ผ่าน: ' + JSON.stringify(e));
        return;
      }
      todo.push('socket ปฏิเสธ token ตอน handshake — token ใช้ไม่ได้หรือ session ถูกเพิกถอนแล้ว');
      finish(NO + ' auth ไม่ผ่าน: ' + JSON.stringify(e));
    });
    sock.on('connect_error', (e) => finish(NO + ' ต่อไม่ได้: ' + e.message));
    sock.on('disconnect', (r) => finish('ถูกตัดการเชื่อมต่อ: ' + r));

    setTimeout(() => finish(wantKeys ? 'ครบ 30 วินาที' : null), wantKeys ? 30000 : 10000);
  });
}

async function main() {
  console.log('อ่าน env จาก      :', path.join(WEB, '.env') + ' (+ .env.local ถ้ามี)');
  console.log('VITE_SUPABASE_URL :', supabaseUrl || '(ว่าง)');
  console.log('anon key          :', mask(anonKey));
  console.log('VITE_WS_URL       :', wsUrl || '(ว่าง)');
  console.log('SYNEXTA_EMAIL     :', email || '(ว่าง)');
  console.log('SYNEXTA_PASSWORD  :', password ? '(ตั้งแล้ว)' : '(ว่าง)');
  console.log('');

  if (!supabaseUrl || !anonKey) {
    die('ต้องมี VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY ใน packages/web/.env');
  }
  if (!email || !password) {
    die(
      'ต้องตั้ง SYNEXTA_EMAIL และ SYNEXTA_PASSWORD ก่อน — ห้ามใส่ลงในไฟล์นี้\n' +
        '  ใส่ใน packages/web/.env.local (gitignore ครอบไว้แล้ว) หรือสั่งแบบ\n' +
        '  SYNEXTA_EMAIL=you@synexta.com SYNEXTA_PASSWORD=... npm run token',
    );
  }

  const { createClient } = require('@supabase/supabase-js');
  // ไม่เก็บ session ลงดิสก์ — สคริปต์นี้ขอ token มาใช้ครั้งเดียว
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('กำลังล็อกอิน…');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) die('ล็อกอินไม่ผ่าน: ' + error.message);

  const token = data.session?.access_token;
  if (!token) {
    die('ล็อกอินผ่านแต่ไม่มี session — บัญชีนี้ยังไม่ได้ยืนยันอีเมล (mailer_autoconfirm ปิดอยู่)');
  }

  console.log(OK, 'ได้ token แล้ว\n');
  console.log(token);
  console.log('');

  const claims = decodeJwt(token);
  if (claims) {
    const mins = Math.round((claims.exp * 1000 - Date.now()) / 60000);
    console.log('user  :', claims.email, '·', claims.sub);
    console.log('role  :', claims.role, '| global_role:', JSON.stringify(claims.global_role));
    console.log('exp   : อีก', mins, 'นาที');
    const orgs = Array.isArray(claims.org_roles) ? claims.org_roles : [];
    console.log('org ใน token:', orgs.length === 0 ? '(ไม่มี)' : '');
    for (const o of orgs) console.log('   -', o.org_id, '·', o.role);
    console.log('');
  }

  if (wantCheck && wsUrl) await checkBackend(token);
  if (wantWs) {
    if (!wsUrl || !deviceId || !orgId) {
      die('ต้องมี VITE_WS_URL, VITE_FARM_DEVICE_ID, VITE_FARM_ORG_ID ครบก่อนจะลองต่อ WebSocket');
    }
    await checkSocket(token);
  }

  /*
   * signOut **ท้ายสุด** — backend ตรวจ session ไม่ใช่แค่ลายเซ็น JWT
   * เพิกถอน session ก่อนแล้วเอา token เดิมไปยิงจะได้ 401 ทั้งที่ token ยังไม่หมดอายุ
   * (เสียเวลาไล่หาสาเหตุมาแล้วเพราะพลาดจุดนี้)
   */
  await supabase.auth.signOut();

  console.log('');
  if (todo.length === 0) {
    console.log(OK, 'ไม่พบปัญหาที่ตรวจได้ — เอา token ข้างบนไปแปะในแผง dev มุมขวาล่างของเว็บ');
    if (!wantKeys) console.log('  อยากเห็นชื่อ key จริงให้สั่ง: npm run token -- --keys');
  } else {
    console.log('── ต้องแก้ ' + todo.length + ' ข้อ ──');
    todo.forEach((t, i) => console.log(' ' + (i + 1) + '.', t));
  }
}

main().catch((e) => die(String(e?.stack ?? e?.message ?? e)));
