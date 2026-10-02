export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function mdInline(s) {
  const codes = [];
  let out = escapeHtml(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

const CALLOUTS = [['💡', 'tip'], ['⚠', 'warn'], ['🧪', 'lab'], ['📌', 'note']];
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

const BS = String.fromCharCode(92); // обратная косая черта

// ячейки строки таблицы; «\|» — символ «|» внутри ячейки
function tableCells(line) {
  const cells = [];
  let cur = '';
  const t = line.trim();
  for (let i = 0; i < t.length; i++) {
    if (t[i] === BS && t[i + 1] === '|') { cur += '|'; i++; }
    else if (t[i] === '|') { cells.push(cur); cur = ''; }
    else cur += t[i];
  }
  cells.push(cur);
  if (t[0] === '|') cells.shift();
  if (t[t.length - 1] === '|' && t[t.length - 2] !== BS) cells.pop();
  return cells.map(c => c.trim());
}

const isTableStart = (head, sep) => head !== undefined && sep !== undefined && head.includes('|') && sep.includes('|') && TABLE_SEP.test(sep)
  && tableCells(head).length === tableCells(sep).length;

function tableHtml(head, rows) {
  const n = head.length;
  const tr = (cells, tag) => `<tr>${Array.from({ length: n }, (_, i) => `<${tag}>${mdInline(cells[i] ?? '')}</${tag}>`).join('')}</tr>`;
  return `<div class="table-wrap"><table><thead>${tr(head, 'th')}</thead><tbody>${rows.map(r => tr(r, 'td')).join('')}</tbody></table></div>`;
}

export function md(src = '') {
  const lines = String(src ?? '').replace(/\r/g, '').split('\n');
  let out = '';
  let para = [];
  let list = null;
  let code = null;
  const flushPara = () => { if (para.length) { out += `<p>${mdInline(para.join(' '))}</p>`; para = []; } };
  const flushList = () => { if (list) { out += `<${list.tag}>${list.items.map(i => `<li>${mdInline(i)}</li>`).join('')}</${list.tag}>`; list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      if (code) { out += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`; code = null; }
      else { flushPara(); flushList(); code = []; }
      continue;
    }
    if (code) { code.push(line); continue; }
    if (/^\s*>/.test(line)) { // цитата или выноска: блок подряд идущих строк «> …»
      flushPara(); flushList();
      const inner = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { inner.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      i--;
      const first = (inner.find(l => l.trim()) || '').trim();
      const kind = CALLOUTS.find(([ico]) => first.startsWith(ico));
      out += kind ? `<div class="callout ${kind[1]}">${md(inner.join('\n'))}</div>` : `<blockquote>${md(inner.join('\n'))}</blockquote>`;
      continue;
    }
    if (isTableStart(line, lines[i + 1])) {
      flushPara(); flushList();
      const head = tableCells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { rows.push(tableCells(lines[i])); i++; }
      i--;
      out += tableHtml(head, rows);
      continue;
    }
    const head = line.match(/^(#{1,3})\s+(.*)$/);
    if (head) { flushPara(); flushList(); const n = head[1].length + 2; out += `<h${n}>${mdInline(head[2])}</h${n}>`; continue; }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((ul || ol)[1]);
      continue;
    }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    flushList();
    para.push(line.trim());
  }
  if (code) out += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`;
  flushPara(); flushList();
  return out;
}

export const norm = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

export const round1 = x => Math.round(x * 10 + Number.EPSILON) / 10;

export function shuffledIndices(n, rnd = Math.random) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  if (n > 1 && a.every((v, i) => v === i)) a.push(a.shift());
  return a;
}
