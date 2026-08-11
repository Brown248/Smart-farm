import s from './RouteFallback.module.css';

/**
 * โครงหน้าจางๆ ระหว่างรอโค้ดของหน้านั้นโหลด (route-level code splitting)
 *
 * **ไม่ใช้สปินเนอร์กลางจอ** — สปินเนอร์ทำให้จอวูบเป็นพื้นว่างแล้วเด้งกลับ
 * ซึ่งรู้สึกช้ากว่าทั้งที่จริงเร็วกว่า · โครงจางๆ ที่มีสัดส่วนใกล้ของจริงทำให้สายตา
 * ไม่ต้องรีเซ็ตตำแหน่งใหม่ตอนของจริงมาแทน (ภาษาเดียวกับ `g.skel` ของหน้าอื่น)
 *
 * `aria-hidden` + `role="presentation"` — ไม่ใช่เนื้อหา ไม่ต้องให้ screen reader อ่าน
 * ส่วนคนที่ตั้ง reduced-motion ไม่ต้องเห็นการเต้น (จัดการใน CSS)
 */
export function RouteFallback() {
  return (
    /* `data-route-loading` ให้เทสรอได้ว่าโค้ดของหน้านั้นโหลดเสร็จหรือยัง (ดู `test/routeReady`) */
    <div className={s.wrap} role="presentation" aria-hidden="true" data-route-loading>
      <div className={s.bar} />
      <div className={s.grid}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={s.card} />
        ))}
      </div>
      <div className={s.wide} />
    </div>
  );
}
