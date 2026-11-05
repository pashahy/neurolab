import { h, add } from '../util/dom.js';
import { md } from '../util/text.js';
import CHEAT from '../../content/cheatsheet.js';

// Конспект-шпаргалка (#/memo): Python и Git для тех, кто «совсем не понимает».
// Контент — content/cheatsheet.js (markdown в md-полях).
export function renderCheatsheet(app) {
  const nav = h('nav', { class: 'cheat-nav', 'aria-label': 'Разделы шпаргалки' });
  const body = h('div', { class: 'cheat-body' });
  add(app.root,
    h('header', { class: 'cheat-head' },
      h('h1', { class: 'display' }, `📖 ${CHEAT.title}`),
      h('p', { class: 'hint' }, CHEAT.intro),
      h('div', { class: 'row' },
        h('a', { class: 'btn ghost', href: '#/' }, '← На главную'),
        h('a', { class: 'btn', href: '#/sandbox' }, '🧪 Открыть песочницу'))),
    nav,
    body);

  for (const part of CHEAT.parts) {
    nav.append(h('div', { class: 'cheat-nav-part' },
      h('div', { class: 'cheat-nav-title' }, `${part.icon} ${part.title}`),
      part.sections.map(s => h('a', {
        class: 'cheat-nav-link', href: `#/memo?s=${part.id}-${s.id}`,
        onclick: e => { e.preventDefault(); scrollToSection(`${part.id}-${s.id}`); },
      }, s.title))));

    const secs = part.sections.map(s => h('section', { class: 'card cheat-sec', id: `${part.id}-${s.id}`, 'aria-labelledby': `h-${part.id}-${s.id}` },
      h('h2', { id: `h-${part.id}-${s.id}` }, s.title),
      h('div', { class: 'md', html: md(s.md) })));
    body.append(h('div', { class: 'cheat-part' },
      h('h2', { class: 'sec-title cheat-part-title' }, `${part.icon} ${part.title}`),
      secs));
  }

  // «Копировать» для блоков кода
  body.querySelectorAll('pre').forEach(pre => {
    const btn = h('button', { class: 'btn small cheat-copy', type: 'button' }, 'Копировать');
    btn.addEventListener('click', async () => {
      const code = pre.querySelector('code')?.innerText ?? pre.innerText;
      try { await navigator.clipboard.writeText(code); btn.textContent = 'Скопировано ✓'; }
      catch {
        try {
          const ta = h('textarea', { style: 'position:fixed;opacity:0' }, code);
          document.body.append(ta); ta.select();
          document.execCommand('copy'); ta.remove();
          btn.textContent = 'Скопировано ✓';
        } catch { btn.textContent = 'Не удалось'; }
      }
      setTimeout(() => { btn.textContent = 'Копировать'; }, 1500);
    });
    pre.classList.add('cheat-pre');
    pre.append(btn);
  });

  // открытие по ссылке вида #/memo?s=<id>
  const q = location.hash.indexOf('?') >= 0 ? new URLSearchParams(location.hash.slice(location.hash.indexOf('?') + 1)) : null;
  const target = q && q.get('s');
  if (target && document.getElementById(target)) setTimeout(() => scrollToSection(target), 50);
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('cheat-flash');
  setTimeout(() => el.classList.remove('cheat-flash'), 1600);
}
