import s from './effects.module.css';

export interface LightningProps {
  readonly opacity: number;
}

/** แฟลชฟ้าแลบ — ควบคุมจังหวะจาก useLightning */
export function Lightning({ opacity }: LightningProps) {
  return <div className={s.lightning} aria-hidden="true" style={{ opacity }} />;
}
