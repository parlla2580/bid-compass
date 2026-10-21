import { TODAY } from './data';

export const fmtNum = (n: number) => Math.round(n).toLocaleString('ko-KR');
export const fmtWon = (n: number) => fmtNum(n) + '원';

/** 1.2억 / 8,500만 / 15억 */
export function fmtShort(n: number) {
  if (n >= 1e8) return parseFloat((n / 1e8).toFixed(1)) + '억';
  return Math.round(n / 1e4).toLocaleString('ko-KR') + '만';
}

/** 범위 슬라이더 라벨: 1천만원 / 5억원 / 50억원 */
export function fmtRange(n: number) {
  if (n >= 1e8) return parseFloat((n / 1e8).toFixed(1)) + '억원';
  if (n >= 1e7) return n / 1e7 + '천만원';
  return fmtShort(n) + '원';
}

/** 1억 2,000만원 */
export function fmtKorean(n: number) {
  if (!n) return '';
  const eok = Math.floor(n / 1e8);
  const man = Math.floor((n % 1e8) / 1e4);
  return [eok ? eok.toLocaleString('ko-KR') + '억' : '', man ? man.toLocaleString('ko-KR') + '만' : ''].filter(Boolean).join(' ') + '원';
}

export function deadlineOf(d: number) {
  const dt = new Date(TODAY);
  dt.setDate(dt.getDate() + d);
  return dt;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (dt: Date) => `${dt.getFullYear()}.${pad(dt.getMonth() + 1)}.${pad(dt.getDate())}`;

/** 사업자등록번호 마스크 XXX-XX-XXXXX */
export function maskBizNo(value: string) {
  const v = value.replace(/\D/g, '').slice(0, 10);
  if (v.length > 5) return `${v.slice(0, 3)}-${v.slice(3, 5)}-${v.slice(5)}`;
  if (v.length > 3) return `${v.slice(0, 3)}-${v.slice(3)}`;
  return v;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
