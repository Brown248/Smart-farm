import { useCallback, useRef } from 'react';
import { HS_CHANNELS, HS_TEST_CHANNEL } from '@shared/handysense';
import { useFarmState } from '@/state/FarmStateProvider';
import { hhmm } from '@/lib/format';
import { LOG_LIMIT } from '@/lib/deviceTiming';
import { newReqId, postHsCommand, readHsContext } from '@/services/handysenseControl';
import type { Dict } from '@/i18n/keys';
import type { ConfirmApi } from './useConfirm';

// LOG_LIMIT ย้ายไป `lib/deviceTiming` (โมดูลกลาง) — re-export ไว้เพื่อความเข้ากันได้เดิม
export { LOG_LIMIT };

export interface UseEstopOptions {
  readonly t: Dict;
  readonly confirm: ConfirmApi;
  readonly flash: (message: string) => void;
}

export interface EstopApi {
  readonly estop: boolean;
  /** กดหยุด = ติดทันที · กดปลด = ต้องยืนยันก่อน */
  readonly estopPress: () => void;
  readonly addLog: (text: string) => void;
}

/**
 * หยุดฉุกเฉิน — **implementation เดียวของทั้งระบบ**
 *
 * แยกออกมาจาก `useDeviceCommand` เพราะปุ่มหยุดฉุกเฉินย้ายไปอยู่ที่แถบเมนู (`AppRail`)
 * ซึ่งไม่ได้ถืออุปกรณ์อะไรเลย ถ้าปล่อยให้แถบเมนูเรียก `useDeviceCommand` ทั้งก้อน
 * มันจะต้องรู้จักอุณหภูมิและ guard ทั้งที่ไม่เกี่ยว
 *
 * เคยมีสองเวอร์ชัน: ฉากเกม/ชลประทานยืนยันก่อนปลดล็อก ส่วนหน้าโรงเรือนปลดได้ในกดเดียว
 * อุปกรณ์ชุดเดียวกันแต่ขั้นตอนความปลอดภัยต่างกันตามหน้าที่เปิดอยู่ (ขัดกฎเหล็กข้อ 2)
 *
 * **"สั่งหยุด" ไม่ผ่านกล่องยืนยัน** — ออกแบบให้กดครั้งเดียวติด เร็วที่สุด (ต้นแบบก็ทำแบบนี้)
 * มีเฉพาะ "ปลดล็อก" ที่ต้องยืนยัน เพราะมันคือการปล่อยให้อุปกรณ์กลับมารับคำสั่งได้อีก
 */
export function useEstop({ t, confirm, flash }: UseEstopOptions): EstopApi {
  const { estop, setEstop, setDevices, setLog, realControl } = useFarmState();

  // อ่านค่าล่าสุดตอน callback ทำงาน (ผู้ใช้อาจสลับภาษาระหว่างกล่องยืนยันเปิดค้างอยู่)
  const tRef = useRef(t);
  tRef.current = t;
  const estopRef = useRef(estop);
  estopRef.current = estop;
  const realControlRef = useRef(realControl);
  realControlRef.current = realControl;

  const addLog = useCallback(
    (text: string) => {
      setLog((prev) =>
        [{ t: hhmm(new Date()), text, src: 'manual' as const }, ...prev].slice(0, LOG_LIMIT),
      );
    },
    [setLog],
  );

  const estopPress = useCallback(() => {
    const tt = tRef.current;

    if (estopRef.current) {
      confirm.ask({
        title: tt.unlockTitle,
        body: tt.unlockBody,
        run: () => {
          setEstop(false);
          addLog(tt.logUnlock);
          // โหมดจริง: เตือนว่า auto ยังปิดอยู่ (estop ปิดไว้) ไม่งั้นผู้ใช้จะรอให้พัดลมทำงานเองแล้วไม่เกิดขึ้น
          flash(realControlRef.current ? tt.estopAutoDisabled : tt.unlockToast);
        },
      });
      return;
    }

    // ห้ามเรียก setDevices ข้างใน updater ของ setEstop — StrictMode เรียกซ้ำ (กับดักข้อ 9)
    setEstop(true);
    setDevices((prev) => prev.map((d) => ({ ...d, on: false, pending: null })));
    addLog(tt.logEstop);
    flash(tt.estopToast);

    /*
     * โหมดจริง: **ปิดเกณฑ์อัตโนมัติในตัวอุปกรณ์ก่อน แล้วค่อยสั่งปิดสวิตช์**
     *
     * ของเดิมยิงแค่ `setSwitch off` → พัดลมที่ตั้ง `mode:'auto'` ไว้จะกลับมาหมุนเอง
     * ทันทีที่อุณหภูมิเข้าเงื่อนไขในรอบประเมินถัดไป (~10 วิ) = หยุดฉุกเฉินไม่ได้หยุดจริง
     *
     * **ลำดับสำคัญ** — ถ้าสั่งปิดสวิตช์ก่อนแล้วค่อยปิดเกณฑ์ อุปกรณ์อาจเปิดกลับคั่นกลางสองคำสั่ง
     * ยังเป็น fire-and-forget เพราะ estop ต้องติดทันที ห้ามรอ network (state ในเครื่องพลิกไปแล้ว)
     *
     * ผลข้างเคียงที่ตั้งใจ: ปลดล็อกแล้ว **auto จะยังปิดอยู่** ผู้ใช้ต้องเปิดเองที่หน้าควบคุมโรงเรือน
     * (เจ้าของงานเลือกทางนี้ — ปลอดภัยกว่าให้ของกลับมาเดินเองโดยไม่ตั้งใจ)
     */
    if (realControlRef.current) {
      const ctx = readHsContext();
      if (ctx) {
        for (const ch of HS_CHANNELS) {
          if (ch === HS_TEST_CHANNEL) continue; // ช่อง test ไม่มีอุปกรณ์จริง
          void postHsCommand(
            ctx,
            { action: 'setThreshold', channel: ch, mode: 'no-auto' },
            newReqId(),
          )
            .then(() =>
              postHsCommand(ctx, { action: 'setSwitch', channel: ch, on: false }, newReqId()),
            )
            .catch(() => {});
        }
        addLog(tt.logEstopAutoOff);
      }
    }
  }, [addLog, confirm, flash, setDevices, setEstop]);

  return { estop, estopPress, addLog };
}
