import { POSE_SRC, poseEntryAnimation } from '@/lib/agentPose';
import type { AgentPose } from '@/lib/agentPose';
import { useI18n } from '@/i18n/useI18n';
import { useTypewriter } from '@/hooks/useTypewriter';
import { SpeechBubble } from './SpeechBubble';
import s from './AgentBear.module.css';

/** ประกายรอบตัวตอนดีใจ */
const SPARKLES = [
  { left: '4%', top: '8%', delay: '0s' },
  { left: '82%', top: '4%', delay: '.5s' },
  { left: '90%', top: '46%', delay: '1s' },
  { left: '-2%', top: '42%', delay: '1.4s' },
] as const;

export interface AgentBearProps {
  readonly pose: AgentPose;
  readonly message: string;
  readonly sleeping: boolean;
  readonly reduced: boolean;
  /** ความสูงสูงสุดที่ใช้ได้ กันไม่ให้ทะลุ HUD บนจอเตี้ย */
  readonly maxHeight: number;
}

/**
 * ตัวละคร AI 9 ท่า พร้อมบับเบิลข้อความ
 * เปลี่ยนท่าแล้วเล่น animation เข้าใหม่ (celebration กระโดด · เตือน/ชี้ สั่น)
 * ทำด้วยการ remount ผ่าน `key` แทนการยัด style ตรงๆ เหมือนต้นแบบ
 */
export function AgentBear({ pose, message, sleeping, reduced, maxHeight }: AgentBearProps) {
  const { t } = useI18n();
  const typed = useTypewriter(message, reduced);

  return (
    <div className={s.wrap} style={{ maxHeight: Math.max(160, maxHeight) + 'px' }}>
      <SpeechBubble name={t.agentName} text={typed} fullText={message} sleeping={sleeping} />

      <div className={s.body}>
        {pose === 'celebration' && !reduced
          ? SPARKLES.map((sp) => (
              <span
                key={sp.delay}
                aria-hidden="true"
                className={s.sparkle}
                style={{
                  left: sp.left,
                  top: sp.top,
                  animation: `fsSparkle 1.7s ease-in-out ${sp.delay} infinite`,
                }}
              />
            ))
          : null}
        <img
          key={pose}
          className={s.img}
          src={POSE_SRC[pose]}
          alt={t.agentName}
          style={reduced ? undefined : { animation: poseEntryAnimation(pose) }}
        />
      </div>
    </div>
  );
}
