import { strToU8, zipSync } from 'fflate';

/*
 * 아주 작은 엑셀(.xlsx) 작성기 — 외부 서비스로 데이터를 보내지 않고 브라우저에서 바로 만든다
 * 셀: 문자열 / 숫자 / 빈칸. 제목 줄은 굵게·고정, 자동 필터, 열마다 숫자 형식
 */

export type Cell = string | number | null | undefined;
export type Fmt = 'text' | 'int' | 'won' | 'pct' | 'date';
export interface Sheet { name: string; columns: { title: string; width?: number; fmt?: Fmt }[]; rows: Cell[][]; note?: string }

// styles.xml 의 cellXfs 순서: 0 기본, 1 제목(굵게·회색 바탕), 2 천 단위, 3 소수 3자리, 4 날짜, 5 안내(회색 글자)
const STYLE: Record<Fmt, number> = { text: 0, int: 2, won: 2, pct: 3, date: 4 };

const esc = (s: string) => s
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const colName = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

function cellXml(ref: string, v: Cell, style: number) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}" s="${style}"><v>${v}</v></c>` : '';
  // 글자는 inlineStr 로만 넣어 '=' 등으로 시작해도 수식으로 계산되지 않음
  return `<c r="${ref}" t="inlineStr" s="${style === 1 || style === 5 ? style : 0}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

const headRow = (s: Sheet) => (s.note ? 3 : 1);

function sheetXml(s: Sheet) {
  const cols = s.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 14}" customWidth="1"/>`).join('');
  const lines: string[] = [];
  if (s.note) lines.push(`<row r="1">${cellXml('A1', s.note, 5)}</row>`);
  const head = headRow(s);
  lines.push(`<row r="${head}">${s.columns.map((c, i) => cellXml(`${colName(i)}${head}`, c.title, 1)).join('')}</row>`);
  s.rows.forEach((row, k) => {
    const r = head + 1 + k;
    lines.push(`<row r="${r}">${row.map((v, i) => cellXml(`${colName(i)}${r}`, v, STYLE[s.columns[i]?.fmt ?? 'text'])).join('')}</row>`);
  });
  const last = `${colName(Math.max(0, s.columns.length - 1))}${head + s.rows.length}`;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${head}" topLeftCell="A${head + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + `<cols>${cols}</cols><sheetData>${lines.join('')}</sheetData>`
    + (s.rows.length ? `<autoFilter ref="A${head}:${last}"/>` : '')
    + '</worksheet>';
}

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="2"><numFmt numFmtId="164" formatCode="0.000"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts>'
  + '<fonts count="3"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font><font><sz val="10"/><color rgb="FF8A929E"/><name val="맑은 고딕"/></font></fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F3F5"/></patternFill></fill></fills>'
  + '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="6"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="3" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/><xf fontId="2" applyFont="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

/** 엑셀 날짜 일련번호 (한국 시간 기준 날짜) */
export const excelDate = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400e3 + 25569;
};

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const names = sheets.map((s) => s.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31));
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const filters = sheets.map((s, i) => (s.rows.length
    ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i])}'!$A$${headRow(s)}:$${colName(s.columns.length - 1)}$${headRow(s) + s.rows.length}</definedName>`
    : '')).join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>'),
    '_rels/.rels': strToU8(X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
      + (filters ? `<definedNames>${filters}</definedNames>` : '')
      + '</workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8(X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s)); });
  return zipSync(files, { level: 6 });
}

export function downloadXlsx(name: string, sheets: Sheet[]) {
  const blob = new Blob([buildXlsx(sheets) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.endsWith('.xlsx') ? name : `${name}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
