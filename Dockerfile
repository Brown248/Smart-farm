# syntax=docker/dockerfile:1
#
# Syntech Smart Farm — production image
#   stage build  : npm ci + vite build (SPA แบบ static) — อ่านค่า VITE_* จาก packages/web/.env
#   stage serve  : nginx เสิร์ฟ dist/ + reverse-proxy `/hs-proxy` → backend (เลี่ยง CORS) + SPA fallback
#
# build:  docker compose build   (หรือ  docker build -t syntech-web .)
# ⚠️ ต้องมี packages/web/.env (ค่า VITE_*) อยู่ใน build context — Vite inline ค่าเข้า bundle ตอน build
#    (.env เป็น gitignore จึงต้อง build จากเครื่องที่มีไฟล์นี้ หรือ mount/สร้างก่อน build)

# ────────────────────────── build ──────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# ติดตั้ง deps ก่อน copy source ทั้งหมด — cache layer นี้ไว้จนกว่า package*.json จะเปลี่ยน
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/
RUN npm ci

# source ที่เหลือ (รวม packages/web/.env สำหรับ VITE_* · ยกเว้นตาม .dockerignore)
COPY . .
RUN npm run build

# ────────────────────────── serve ──────────────────────────
FROM nginx:1.27-alpine AS serve

# ปลายทาง backend สำหรับ reverse-proxy `/hs-proxy` (แทนที่ตอน start ด้วย envsubst)
# override ได้ตอน run: -e BACKEND_ORIGIN=https://...  (ดู docker-compose.yml)
ENV BACKEND_ORIGIN=https://backend-prod.synexta.ai

# WebSocket ต่อ backend **ตรง** ไม่ผ่าน /hs-proxy → CSP ต้องอนุญาต origin นี้แยกต่างหาก
ENV BACKEND_WS_ORIGIN=wss://backend-prod.synexta.ai
# Supabase (ผู้ใช้ล็อกอินเอง) — ตั้งให้ตรงกับ VITE_SUPABASE_URL ของ build นั้น
ENV SUPABASE_ORIGIN=https://*.supabase.co

# ปลายทางผู้ช่วย AI (llama.cpp ในวง LAN) สำหรับ reverse-proxy `/ai-proxy`
# **ต้องมีค่าดีฟอลต์** — ถ้าว่าง `proxy_pass /;` จะเป็น URL ไม่ถูกต้อง แล้ว nginx ไม่ยอมสตาร์ต
ENV AI_ORIGIN=http://172.16.7.60:8080

# ── โหมด LAN: เซิร์ฟเวอร์ล็อกอินแทนผู้ใช้ ไม่ต้องมีหน้าล็อกอิน ──
# ตั้งครบ 3 ตัวเมื่อไหร่ `location = /auth/token` ถึงจะทำงาน · ว่าง = คืน 404 แล้วแอปใช้หน้าล็อกอินตามเดิม
#
# 🔴 **ห้ามย้ายไป `VITE_*`** — ค่าพวกนั้นถูกฝังลงไฟล์ JS ที่ใครเปิดเว็บก็อ่านได้ (กฎเหล็กข้อ 10)
# ตั้งค่าจริงตอน run เท่านั้น (`.env` ที่รากโปรเจกต์บนเซิร์ฟเวอร์ · ห้าม commit)
#
# ⚠️ เปิดโหมดนี้ = ใครเข้าถึงเว็บได้ก็สั่งอุปกรณ์ได้ ใช้ได้เฉพาะตอนเว็บอยู่ในวง LAN เท่านั้น
ENV FARM_USER=
ENV FARM_PASS=
ENV SUPABASE_ANON_KEY=

# 🔴 **ห้ามตั้ง `ENV CSP=...` ที่นี่** — Docker แทนค่า `${BACKEND_ORIGIN}` ตั้งแต่ตอน build
# แล้วฝังลง image · override ตอน run จะไม่มีผลกับ CSP (nginx proxy ถูก แต่เบราว์เซอร์บล็อก)
# ประกอบตอน container start แทน ดู `deploy/10-csp.envsh`
COPY deploy/10-csp.envsh /docker-entrypoint.d/10-csp.envsh
# 🔴 **ต้อง chmod ตรงนี้ ห้ามพึ่ง mode ที่ติดมากับไฟล์**
# `docker-entrypoint.sh` ของ nginx เช็ค `if [ -x "$f" ]` ก่อน source — ไม่ executable = **ข้ามเงียบๆ**
# แล้ว `CSP` จะไม่ถูกตั้ง กลายเป็น `Content-Security-Policy: ""` โดยไม่มีอะไรฟ้อง
# build จาก Windows ผ่านเพราะ Docker ใส่ exec bit ให้เอง (ระบบไฟล์ Windows ไม่มี bit นี้)
# แต่ clone บน Linux จะได้ 644 → พังเฉพาะบนเซิร์ฟเวอร์จริง ซึ่งเป็นที่ที่เจ็บที่สุด
RUN chmod +x /docker-entrypoint.d/10-csp.envsh

# nginx:alpine จะรัน envsubst บนไฟล์ใน /etc/nginx/templates/*.template ตอน start
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/packages/web/dist /usr/share/nginx/html

EXPOSE 80
# ใช้ entrypoint/cmd เดิมของ nginx:alpine (envsubst templates แล้ว start nginx)
