import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { TH } from '@/i18n/th';
import {
  reportDeviceFreshness,
  reportLiveCoverage,
  reportLiveStatus,
  resetLiveStatusForTest,
} from '@/state/liveStatus';
import { ConnectionPill } from './ConnectionPill';

/**
 * ป้ายนี้แทนคำว่า "ออนไลน์" ที่เคยฝังไว้ตายตัวใน header
 * เรื่องสำคัญคือ **ต้องไม่โกหก** — ยังไม่ได้ต่ออะไรก็ต้องบอกว่าเป็นข้อมูลจำลอง
 */
function renderPill(ago?: string) {
  return render(
    <I18nProvider>
      <ConnectionPill ago={ago} />
    </I18nProvider>,
  );
}

afterEach(() => {
  resetLiveStatusForTest();
});

describe('ConnectionPill', () => {
  it('ค่าเริ่มต้นบอกว่าเป็นข้อมูลจำลอง พร้อมเหตุผล', () => {
    renderPill();
    expect(screen.getByText(TH.connMock)).toBeInTheDocument();
    expect(screen.getByText(TH.connMockHint)).toBeInTheDocument();
  });

  it('ตอนจำลองไม่โชว์ "อัปเดตเมื่อ…" — ไม่มีข้อมูลจริงจะให้บอกเวลา', () => {
    renderPill('อัปเดต 5 วินาทีที่แล้ว');
    expect(screen.queryByText('อัปเดต 5 วินาทีที่แล้ว')).not.toBeInTheDocument();
  });

  it('ต่อติดและได้ค่าครบ → บอกว่าข้อมูลสด พร้อมสัดส่วนและเวลาอัปเดต', () => {
    renderPill('อัปเดต 5 วินาทีที่แล้ว');
    act(() => {
      reportLiveStatus('live');
      reportLiveCoverage(5, 5);
    });

    expect(screen.getByText(TH.connLive)).toBeInTheDocument();
    expect(
      screen.getByText(`${TH.connCoverage(5, 5)} · อัปเดต 5 วินาทีที่แล้ว`),
    ).toBeInTheDocument();
    expect(screen.queryByText(TH.connMock)).not.toBeInTheDocument();
  });

  /*
   * หัวใจของ fix นี้: socket ต่อติด (live) แต่ตัวอุปกรณ์เงียบ (shadow_ts เก่า) = ค่าบนจอเป็น "ค่าค้าง"
   * ป้ายต้องไม่โกหกว่า "ข้อมูลสด · อัปเดต 1 วิ" ทั้งที่อุปกรณ์ออฟไลน์ (อันตรายกับระบบควบคุม)
   */
  it('ต่อติดแต่อุปกรณ์เงียบ (ค่าค้าง) → ต้องบอก "อุปกรณ์ออฟไลน์ · ค่าค้าง" ไม่ใช่ "ข้อมูลสด"', () => {
    renderPill('อัปเดต 1 วินาทีที่แล้ว');
    act(() => {
      reportLiveStatus('live');
      reportLiveCoverage(5, 5);
      reportDeviceFreshness(true, Date.now() - 5 * 60_000); // อุปกรณ์เงียบมา ~5 นาที
    });

    expect(screen.getByText(TH.connDeviceStale)).toBeInTheDocument();
    expect(screen.queryByText(TH.connLive)).not.toBeInTheDocument();
    // ต้องไม่โชว์เวลาอัปเดต socket ที่หลอกว่าเพิ่งสด
    expect(screen.queryByText(/อัปเดต 1 วินาที/)).not.toBeInTheDocument();
  });

  it('ต่อติดแต่อุปกรณ์ถูกระงับ (netpie_banned) → บอก "ถูกระงับ · ติดต่อผู้ดูแล" (สำคัญกว่าค่าค้าง)', () => {
    renderPill('อัปเดต 1 วินาทีที่แล้ว');
    act(() => {
      reportLiveStatus('live');
      reportLiveCoverage(5, 5);
      reportDeviceFreshness(true, Date.now() - 5 * 60_000, true, 0); // ค้าง + ถูกระงับ
    });

    expect(screen.getByText(TH.connDeviceBanned)).toBeInTheDocument();
    expect(screen.queryByText(TH.connDeviceStale)).not.toBeInTheDocument();
    expect(screen.queryByText(TH.connLive)).not.toBeInTheDocument();
  });

  /*
   * สองเทสนี้คือหัวใจของป้าย: **ต่อติดไม่เท่ากับได้ค่าครบ**
   * device ยิงมาแค่ 2 จาก 5 ค่า แล้วป้ายบอก "ข้อมูลสด" เฉยๆ คนใช้จะเข้าใจว่า
   * ทุกเลขบนจอวัดมาจริง ทั้งที่อีก 3 ค่ายังเป็นค่าจำลอง
   */
  it('ต่อติดแต่ได้ค่าไม่ครบ → บอกว่าจริงบางส่วน และบอกว่ากี่ค่าจากกี่ค่า', () => {
    renderPill();
    act(() => {
      reportLiveStatus('live');
      reportLiveCoverage(2, 5);
    });

    expect(screen.getByText(TH.connPartial)).toBeInTheDocument();
    expect(screen.getByText(TH.connCoverage(2, 5))).toBeInTheDocument();
    expect(screen.queryByText(TH.connLive)).not.toBeInTheDocument();
  });

  it('ต่อติดแต่ยังไม่มีค่าเข้ามาเลย → นับเป็นสถานะรอ ไม่ใช่ "ข้อมูลสด"', () => {
    renderPill();
    act(() => {
      reportLiveStatus('live');
      reportLiveCoverage(0, 5);
    });

    expect(screen.getByText(TH.connNoData)).toBeInTheDocument();
    expect(screen.queryByText(TH.connLive)).not.toBeInTheDocument();
  });

  /*
   * "ขาดการเชื่อมต่อ" เฉยๆ ทำให้เดาว่าเน็ตมีปัญหาแล้วนั่งรอ
   * แต่เหตุผลจริงมักเป็น token หมดอายุ ซึ่งแก้ได้ด้วยการล็อกอินใหม่ — ต้องบอกให้เห็นบนจอ
   */
  it('ต่อไม่ติดต้องบอกเหตุผลจากฝั่ง server ไม่ใช่ซ่อนไว้ใน console', () => {
    renderPill();
    act(() => reportLiveStatus('offline', 'Invalid authentication token'));

    expect(screen.getByText(TH.connOffline)).toBeInTheDocument();
    expect(screen.getByText('Invalid authentication token')).toBeInTheDocument();
  });

  it('ตอนข้อมูลสดไม่เอาข้อความ error เก่ามาโชว์ค้าง', () => {
    renderPill();
    act(() => reportLiveStatus('offline', 'Invalid authentication token'));
    act(() => {
      reportLiveStatus('live');
      reportLiveCoverage(5, 5);
    });

    expect(screen.queryByText('Invalid authentication token')).not.toBeInTheDocument();
  });

  it('ไล่สถานะได้ครบทุกแบบ', () => {
    renderPill();
    for (const [status, label] of [
      ['connecting', TH.connConnecting],
      ['reconnecting', TH.connReconnecting],
      ['offline', TH.connOffline],
      ['mock', TH.connMock],
    ] as const) {
      act(() => reportLiveStatus(status));
      expect(screen.getByText(label), status).toBeInTheDocument();
    }
  });
});
