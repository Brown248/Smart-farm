import s from './effects.module.css';

export interface CloudShadowsProps {
  readonly opacity: number;
}

/** เงาเมฆลอยผ่านโรงเรือน — multiply blend ให้ดูเหมือนเงาจริง */
export function CloudShadows({ opacity }: CloudShadowsProps) {
  return (
    <div className={s.cloudWrap} aria-hidden="true" style={{ opacity }}>
      <div className={`${s.cloud} ${s.cloudA}`} />
      <div className={`${s.cloud} ${s.cloudB}`} />
    </div>
  );
}
