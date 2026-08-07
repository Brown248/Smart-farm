# Syntech Smart Farm

ระบบมอนิเตอร์และควบคุมโรงเรือนปลูกผัก โรงเรือน A1
พอร์ตมาจากต้นแบบดีไซน์ที่ผ่านการรีวิวแล้ว — อ่าน `docs/DESIGN_SOURCE.md` ก่อนแก้ UI

> 📁 **เอกสารละเอียด (`docs/`) เป็นของภายใน ไม่ได้อยู่บน GitHub** — ขอจากทีมได้
> ไฟล์นี้คือเอกสารเดียวที่เผยแพร่

**ตอนนี้ใช้ได้ 4 หน้า**

| หน้า           | เส้นทาง       |
| -------------- | ------------- |
| ฉากฟาร์มเกม    | `/`           |
| แดชบอร์ด       | `/dashboard`  |
| ระบบชลประทาน   | `/irrigation` |
| ควบคุมโรงเรือน | `/greenhouse` |

"รายงาน/ประวัติ" กับ "ตั้งค่า" ยังไม่ได้ทำ — **ไม่มีไฟล์ต้นแบบให้ถอด** กดแล้วขึ้น toast "เร็วๆ นี้"

## เริ่มใช้งาน

```bash
npm install
npm run dev        # เครื่องนี้: http://localhost:5173
                   # เครื่องอื่นในวง (แท็บเล็ต): ดูบรรทัด "Network:" ที่ Vite พิมพ์ออกมา
```

Vite ตั้ง `host: true` ไว้ จึงเปิดจากเครื่องอื่นในวงเดียวกันได้ — ตอนรันจะขึ้นสองบรรทัด

```
➜  Local:   http://localhost:5173/
➜  Network: http://172.16.7.108:5173/     ← IP เปลี่ยนตามเครื่อง/DHCP
```

เปิดจากแท็บเล็ตครั้งแรกถ้าโหลดไม่ขึ้น ให้อนุญาต Node.js ผ่าน Windows Firewall (วง Private)

## คำสั่งที่ใช้บ่อย

| คำสั่ง           | ทำอะไร                                                             |
| ---------------- | ------------------------------------------------------------------ |
| `npm run dev`    | รันเว็บโหมดพัฒนา                                                   |
| `npm run build`  | typecheck + build production                                       |
| `npm run verify` | **ต้องผ่านก่อนบอกว่าเสร็จ** — `tsc --noEmit` + `eslint` + `vitest` |
| `npm test`       | รันเทสอย่างเดียว                                                   |
| `npm run format` | จัดรูปแบบโค้ดด้วย Prettier                                         |

## โครงสร้าง

```
packages/shared    type + เกณฑ์ที่ใช้ร่วมกัน (payload ของ WebSocket · guard · threshold)
packages/web       เว็บแอป (Vite + React 18 + TypeScript strict)
scripts/           สคริปต์ทดสอบกับ backend จริง (อ่าน credential จาก env เท่านั้น)
docs/              เอกสารภายใน · ไม่ได้อยู่บน GitHub
```

## สถานะตามแผนย้าย

ดูรายละเอียดที่ `docs/MIGRATION.md` (ภายใน)

- ✅ **Phase 0** — วางฐาน workspace, shared types, design tokens, keyframes, common components
- ✅ **Phase 1** — Farm Scene (`/`) ครบทั้งหน้า
- ✅ **Phase 2** — Dashboard (`/dashboard`) ครบทั้งหน้า
- ✅ **Phase 3** — Irrigation Control (`/irrigation`) ครบทั้งหน้า
- ✅ **Phase 4** — Greenhouse Control (`/greenhouse`) ครบทั้งหน้า
- ✅ **Phase 5** — ต่อข้อมูลจริงผ่าน backend ของทีม (Socket.IO `/telemetry`) + สั่งอุปกรณ์จริง (HandySense)
  ไม่ล็อกอินก็ใช้ได้ ขึ้นป้าย "ข้อมูลจำลอง" ให้เห็นชัด
- ❌ Phase 6 — ปฏิทินดูแล · **ยกเลิก** เอาออกจากระบบแล้ว

## กฎที่ห้ามละเมิด

1. อิงดีไซน์จากต้นแบบใน `docs/reference/` เท่านั้น ห้ามออกแบบใหม่
2. ห้ามเปลี่ยนค่าที่คาลิเบรตแล้ว (`ZONE_GEOMETRY`, `BULBS`, `STEAM`, `FAN_POSITIONS`, `SCENE_AR`)
3. ห้ามลดขั้นตอนความปลอดภัย — confirm / pending+disable / offline / guard / estop
4. TH/EN ต้องครบเท่ากันเสมอ (บังคับด้วย type `Dict` และ `i18n.test.ts`) · คีย์ฉากเกม 168 คำห้ามหาย
5. ห้ามมีปุ่มหลอก — ทุกปุ่มต้องมี handler ที่ทำงานจริง
6. เลเยอร์ตกแต่งต้อง `pointer-events: none` + `aria-hidden` + เคารพ `prefers-reduced-motion`
7. ระบบปลูกผัก/โรงเรือนเท่านั้น · อุปกรณ์จริง 4 ตัว (พัดลมใหญ่ 2 · พัดลมเล็ก 1 · ปั๊มน้ำ 1) — เดิม 5 ตัว เจ้าของงานลดพัดลมเล็กเป็น 1
8. ฝนตกข้างนอกไม่กระทบการรดน้ำ (โรงเรือนปิด) — ฝนโยงกับความชื้น → เปิดพัดลม
9. ห้าม hardcode token/credential — ใช้ env เท่านั้น
10. ห้ามใช้ Three.js / WebGL / GSAP — ฉากทั้งหมดเป็น CSS ล้วน
