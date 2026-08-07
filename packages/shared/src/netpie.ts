import type { NetpieAttr } from './sensor';

/** ── ฝั่งอ่าน: time-series query (รูปแบบคล้าย KairosDB) ── */
export interface NetpieQuery {
  readonly start_absolute: number;
  readonly end_absolute: number;
  readonly metrics: readonly [
    {
      readonly name: string; // device id
      readonly aggregators: readonly unknown[];
      readonly group_by: readonly unknown[];
      readonly tags: { readonly attr: readonly NetpieAttr[] };
    },
  ];
}

export interface NetpieQueryResponse {
  readonly queries: readonly [
    {
      readonly sample_size: number;
      readonly results: readonly {
        readonly name: string;
        readonly tags: { readonly attr: readonly string[] };
        /** [timestamp(ms), value] */
        readonly values: readonly (readonly [number, number])[];
      }[];
    },
  ];
}

/** ── ฝั่งเขียน: publish คำสั่งไปอุปกรณ์ (ยืนยันจริงแค่ led1 / timer00 / max_temp0) ── */
export interface PublishArgs {
  readonly deviceid: string;
  readonly topic: string;
  readonly payload: string;
}

export interface PublishResponse {
  readonly data: {
    readonly publishMessageToDevice: { readonly code: number; readonly text: string };
  };
}
