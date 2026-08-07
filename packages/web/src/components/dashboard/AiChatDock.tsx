import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/common/Icon';
import { useI18n } from '@/i18n/useI18n';
import type { Dict } from '@/i18n/keys';
import s from './AiChatDock.module.css';

/** หน่วงก่อนตอบ ให้รู้สึกว่ากำลังคิด */
const REPLY_DELAY_MS = 550;

interface ChatMessage {
  readonly from: 'ai' | 'user';
  readonly text: string;
}

/**
 * คำตอบสำเร็จรูปตามคำถามลัด — ยังไม่ได้ต่อโมเดลจริง
 * เมื่อมี backend แล้วเปลี่ยนเฉพาะฟังก์ชันนี้เป็นการเรียก API
 */
function replyFor(text: string, t: Dict): string {
  const q = text.trim();
  if (q === t.chip1) return t.chatA1;
  if (q === t.chip2) return t.chatA2;
  if (q === t.chip3) return t.chatA3;
  return t.chatFallback;
}

export function AiChatDock() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<readonly ChatMessage[]>([
    { from: 'ai', text: t.chatGreeting },
  ]);
  const timers = useRef<number[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(window.clearTimeout);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setDraft('');
    setMessages((prev) => [...prev, { from: 'user', text: q }]);
    const reply = replyFor(q, t);
    timers.current.push(
      window.setTimeout(
        () => setMessages((prev) => [...prev, { from: 'ai', text: reply }]),
        REPLY_DELAY_MS,
      ),
    );
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
            <div className={s.headStatus}>
              <span className={s.headStatusDot} aria-hidden="true" />
              {t.chatStatus}
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
              <div className={msg.from === 'user' ? s.bubbleUser : s.bubbleAi}>{msg.text}</div>
            </div>
          ))}
        </div>

        <div className={s.chips}>
          {[t.chip1, t.chip2, t.chip3].map((c) => (
            <button key={c} type="button" className={s.chip} onClick={() => send(c)}>
              {c}
            </button>
          ))}
        </div>

        <div className={s.composer}>
          <input
            className={s.input}
            value={draft}
            placeholder={t.chatPlaceholder}
            aria-label={t.chatPlaceholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send(draft);
            }}
          />
          <button type="button" className={s.send} aria-label={t.askAI} onClick={() => send(draft)}>
            <Icon name="send" size={19} strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </div>
  );
}
