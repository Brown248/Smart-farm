import s from './SpeechBubble.module.css';

export interface SpeechBubbleProps {
  readonly name: string;
  /** ข้อความที่พิมพ์ออกมาแล้ว (typewriter) */
  readonly text: string;
  /** ข้อความเต็ม — ใช้เป็น key ให้บับเบิลเด้งใหม่เมื่อเปลี่ยนเรื่องพูด */
  readonly fullText: string;
  readonly sleeping: boolean;
}

export function SpeechBubble({ name, text, fullText, sleeping }: SpeechBubbleProps) {
  return (
    <div className={s.float}>
      <div key={fullText} className={s.bubble} role="status" aria-live="polite">
        <strong className={s.name}>{name}</strong>
        {text}
        {sleeping ? (
          <>
            <span className={s.zzz} aria-hidden="true">
              z z
            </span>
            <span className={`${s.zzz} ${s.zzz2}`} aria-hidden="true">
              z z
            </span>
          </>
        ) : null}
        <span className={s.tail} aria-hidden="true" />
      </div>
    </div>
  );
}
