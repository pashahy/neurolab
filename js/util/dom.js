export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, ...children);
  return el;
}

export function add(el, ...nodes) {
  for (const c of nodes.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function celebrate(el) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4'];
  const box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < 24; i++) {
    const s = h('span');
    s.style.left = `${Math.random() * 100}%`;
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = `${Math.random() * 0.3}s`;
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
    box.append(s);
  }
  el.append(box);
  setTimeout(() => box.remove(), 1800);
}
