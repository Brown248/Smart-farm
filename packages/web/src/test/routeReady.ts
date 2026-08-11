import { waitFor } from '@testing-library/react';

/**
 * รอให้โค้ดของหน้าปัจจุบันโหลดเสร็จ — จำเป็นหลังแยกก้อนตามหน้า (`routes.tsx`)
 *
 * หน้าเพจถูก `lazy()` แล้ว เฟรมแรกหลัง render/กดเมนูจึงเป็น `RouteFallback` (โครงหน้าเปล่า)
 * เทสที่ `getBy*` ทันทีจะไม่เจออะไรเลยแล้วแดง ทั้งที่แอปทำงานปกติ
 *
 * รอจาก `data-route-loading` แทนที่จะรอ element ของหน้า เพราะแต่ละหน้ามีของไม่เหมือนกัน
 * (ฉากเกมไม่มีแถบเมนู หน้าข้อมูลมี) และผ่านทันทีถ้าก้อนนั้นถูกโหลดไปแล้วจากเทสก่อนหน้า
 */
export async function routeReady(): Promise<void> {
  await waitFor(() => {
    if (document.querySelector('[data-route-loading]') !== null) {
      throw new Error('หน้ายังโหลดไม่เสร็จ');
    }
  });
}
