import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/common/Icon';
import { useI18n } from '@/i18n/useI18n';
import type { Dict } from '@/i18n/keys';
import { isAiConfigured } from '@/config/liveData';
import { AiChatError, askFarmAi, type FarmSnapshot } from '@/services/aiChat';
import { useFarmState } from '@/state/FarmStateProvider';
import { formatAiReply } from '@/lib/aiFormat';
import s from './AiChatDock.module.css';

/** หน่วงก่อนตอบของคำตอบสำเร็จรูป ให้รู้สึกว่ากำลังคิด (โหมดจริงไม่ใช้ — ช้าอยู่แล้ว) */
const REPLY_DELAY_MS = 550;

/** ส่งบทสนทนาย้อนหลังไปกี่ตา — พอให้ถามต่อเนื่องได้ แต่ไม่กิน context ของโมเดล 9B จนหมด */
const HISTORY_TURNS = 6;

interface ChatMessage {
  readonly from: 'ai' | 'user';
  readonly text: string;
  /** ข้อความนี้เป็นคำตอบสำเร็จรูป ไม่ได้มาจากโมเดลจริง — ต้องบอกให้เห็น */
  readonly canned?: boolean;
}

/**
 * คำตอบสำเร็จรูปตามคำถามลัด — ใช้เมื่อ **ยังไม่ได้ตั้งค่า AI** หรือเรียกโมเดลไม่สำเร็จ
 * ห้ามเอาไปปนกับคำตอบจริงโดยไม่บอก (กฎเดียวกับค่าเซนเซอร์จำลอง) จึงติดป้ายกำกับทุกครั้ง
 */
function cannedReply(text: string, t: Dict): string {
  const q = text.trim();
  if (q === t.chip1) return t.chatA1;
  if (q === t.chip2) return t.chatA2;
  if (q === t.chip3) return t.chatA3;
  return t.chatFallback;
}

/**
 * คำตอบ AI ที่จัดหน้าแล้ว — บรรทัดสรุปเป็นย่อหน้า · ขั้นตอนเป็นรายการมีจุด
 *
 * ไม่มี `dangerouslySetInnerHTML` เลย — `formatAiReply` คืนโครงข้อมูลล้วนแล้วให้ React วาด
 * ข้อความจากโมเดลจึงกลายเป็น HTML ไม่ได้ ต่อให้มันพ่นแท็กมาก็ตาม
 */
function AiAnswer({ text }: { readonly text: string }) {
  const blocks = formatAiReply(text);
  if (blocks.length === 0) return <>{text}</>;

  return (
    <>
      {blocks.map((b, i) =>
        b.kind === 'para' ? (
          <p key={i} className={s.ansPara}>
            {b.spans.map((sp, j) => (sp.strong ? <b key={j}>{sp.text}</b> : sp.text))}
          </p>
        ) : (
          <ul key={i} className={s.ansList}>
            {b.items.map((item, j) => (
              <li key={j} className={s.ansItem}>
                {item.map((sp, k) => (sp.strong ? <b key={k}>{sp.text}</b> : sp.text))}
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

export function AiChatDock() {
  const { t, lang } = useI18n();
  const { climate, zones, live, devices, estop } = useFarmState();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([
    { from: 'ai', text: t.chatGreeting },
  ]);
  const timers = useRef<number[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  /** อ่านของสดตอนคำตอบกลับมา ไม่ใช่ตอนกดส่ง (โมเดลใช้เวลาหลายวินาที ค่าอาจขยับไปแล้ว) */
  const stateRef = useRef({ climate, zones, live, devices, estop });
  stateRef.current = { climate, zones, live, devices, estop };

  const aiOn = isAiConfigured();

  useEffect(() => {
    mounted.current = true;
    const pending = timers.current;
    return () => {
      mounted.current = false;
      pending.forEach(window.clearTimeout);
    };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, busy]);

  /** ภาพรวมฟาร์มที่ส่งให้โมเดล — บอกด้วยว่าค่าไหนของจริง ไม่งั้นมันฟันธงจากเลขจำลอง */
  const snapshot = (): FarmSnapshot => {
    const cur = stateRef.current;
    return {
      tempC: cur.climate.temp,
      humidityPct: cur.climate.rh,
      lightKlux: cur.climate.lux,
      soilPct: cur.live.fields.has('soil') ? (cur.zones[0]?.soil ?? null) : null,
      liveFields: [...cur.live.fields],
      devicesOn: cur.devices.filter((d) => d.on).map((d) => d.id),
      estop: cur.estop,
    };
  };

  const pushCanned = (q: string) => {
    const reply = cannedReply(q, t);
    timers.current.push(
      window.setTimeout(() => {
        if (mounted.current)
          setMessages((prev) => [...prev, { from: 'ai', text: reply, canned: true }]);
      }, REPLY_DELAY_MS),
    );
  };

  const send = (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setDraft('');
    const history = messages
      .slice(-HISTORY_TURNS)
      .filter((m) => !m.canned)
      .map((m) => ({
        role: m.from === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text,
      }));
    setMessages((prev) => [...prev, { from: 'user', text: q }]);

    // ยังไม่ได้ตั้งค่า AI → ตอบสำเร็จรูปเหมือนเดิม แต่ติดป้ายว่าไม่ใช่คำตอบจริง
    if (!aiOn) return pushCanned(q);

    setBusy(true);
    void askFarmAi(q, snapshot(), lang, history)
      .then((answer) => {
        if (mounted.current) setMessages((prev) => [...prev, { from: 'ai', text: answer }]);
      })
      .catch((e: unknown) => {
        if (!mounted.current) return;
        // บอกสาเหตุที่แก้ได้ แล้วค่อยตกไปคำตอบสำเร็จรูป — ห้ามเงียบแล้วปล่อยให้คิดว่า AI ตอบ
        const kind = e instanceof AiChatError ? e.kind : 'network';
        const reason = kind === 'timeout' ? t.chatTimeout : t.chatUnreachable;
        setMessages((prev) => [
          ...prev,
          { from: 'ai', text: reason, canned: true },
          { from: 'ai', text: cannedReply(q, t), canned: true },
        ]);
      })
      .finally(() => {
        if (mounted.current) setBusy(false);
      });
  };

  if (!open) {
    return (
      <button type="button" className={s.fab} onClick={() => setOpen(true)}>
        <span className={s.fabIcon} aria-hidden="true">
          <span className={s.fabRipple} />
          <Icon name="chatBubble" size={20} color="#fff" strokeWidth={1.8} />
        </span>
        {t.askAI}
      </button>
    );
  }

  return (
    <div className={s.wrap}>
      <button
        type="button"
        className={s.scrim}
        aria-label={t.close}
        tabIndex={-1}
        onClick={() => setOpen(false)}
      />
      <div className={s.panel} role="dialog" aria-modal="true" aria-label={t.chatTitle}>
        <div className={s.head}>
          <span className={s.headIcon} aria-hidden="true">
            <Icon name="leaf" size={19} color="#dcead9" />
          </span>
          <div className={s.headText}>
            <div className={s.headTitle}>{t.chatTitle}</div>
            {/* บอกตรงๆ ว่าตอบด้วยโมเดลจริงหรือคำตอบสำเร็จรูป — ห้ามให้เดาเอง */}
            <div className={s.headStatus}>
              <span className={s.headStatusDot} aria-hidden="true" />
              {aiOn ? t.chatStatus : t.chatOffline}
            </div>
          </div>
          <button
            type="button"
            className={s.headClose}
            aria-label={t.close}
            onClick={() => setOpen(false)}
          >
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>

        <div className={s.messages} ref={listRef} aria-live="polite">
          {messages.map((msg, i) => (
            <div key={i} className={msg.from === 'user' ? s.rowUser : s.rowAi}>
              <div className={msg.from === 'user' ? s.bubbleUser : s.bubbleAi}>
                {/*
                  คำถามของผู้ใช้แสดงดิบ · คำตอบ AI จัดหน้าให้อ่านง่าย (ย่อหน้า/รายการ/ตัวหนา)
                  โมเดลพ่น "- " กับ "**" มาอยู่แล้ว ถ้าโชว์ดิบจะเห็นขีดกับดาวเต็มไปหมด
                */}
                {msg.from === 'user' ? msg.text : <AiAnswer text={msg.text} />}
                {/* คำตอบสำเร็จรูปต้องแยกออกจากคำตอบของโมเดลจริงให้เห็น (กฎเดียวกับค่าเซนเซอร์จำลอง) */}
                {msg.canned && aiOn ? <span className={s.cannedTag}>{t.chatCanned}</span> : null}
              </div>
            </div>
          ))}
          {busy ? (
            <div className={s.rowAi}>
              <div className={s.bubbleAi}>
                <span className={s.typing} aria-hidden="true" />
                {t.chatThinking}
              </div>
            </div>
          ) : null}
        </div>

        <div className={s.chips}>
          {[t.chip1, t.chip2, t.chip3].map((c) => (
            <button
              key={c}
              type="button"
              className={s.chip}
              disabled={busy}
              onClick={() => send(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <div className={s.composer}>
          <input
            className={s.input}
            value={draft}
            disabled={busy}
            placeholder={t.chatPlaceholder}
            aria-label={t.chatPlaceholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send(draft);
            }}
          />
          <button
            type="button"
            className={s.send}
            aria-label={t.askAI}
            disabled={busy}
            onClick={() => send(draft)}
          >
            <Icon name="send" size={19} strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </div>
  );
}
