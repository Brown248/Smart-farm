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

# nginx:alpine จะรัน envsubst บนไฟล์ใน /etc/nginx/templates/*.template ตอน start
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/packages/web/dist /usr/share/nginx/html

EXPOSE 80
# ใช้ entrypoint/cmd เดิมของ nginx:alpine (envsubst templates แล้ว start nginx)
