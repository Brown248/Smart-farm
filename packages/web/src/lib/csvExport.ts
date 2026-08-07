/** สร้างและดาวน์โหลดไฟล์ CSV จริงจากชุดข้อมูลที่กำลังแสดงอยู่ */
export function toCsvRows(
  header: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): string {
  return [header, ...rows].map((r) => r.join(',')).join('\n');
}

export const csvFilename = (metric: string, range: string): string =>
  `syntech-${metric}-${range}.csv`;

export interface DownloadCsvArgs {
  readonly filename: string;
  readonly csv: string;
}

/**
 * เขียน Blob แล้วกดลิงก์ดาวน์โหลดให้ — คืน false ถ้าเบราว์เซอร์ไม่รองรับ
 * (ปุ่มดาวน์โหลดต้องทำงานจริง ไม่ใช่ปุ่มเปล่า — กฎเหล็กข้อ 2)
 */
export function downloadCsv({ filename, csv }: DownloadCsvArgs): boolean {
  if (typeof URL?.createObjectURL !== 'function') return false;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
