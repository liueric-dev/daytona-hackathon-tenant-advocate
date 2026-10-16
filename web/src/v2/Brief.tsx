import type { ReactNode } from 'react';

// Renders model output as React elements only. Never uses innerHTML.

const INLINE = /(\*\*[^*]+\*\*|\[[^\]\n]+\](?:\([^)\s]+\))?)/g;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith('**')) {
      out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      if (link) {
        const href = link[2] ?? '';
        out.push(
          /^https?:\/\//.test(href) ? (
            <a key={k} href={href} target="_blank" rel="noreferrer noopener">
              {link[1]}
            </a>
          ) : (
            <span key={k}>{link[1]}</span>
          ),
        );
      } else {
        const label = tok.slice(1, -1).trim();
        out.push(
          <span key={k} className="cite" title={label}>
            {label}
          </span>,
        );
      }
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { t: 'h'; level: 2 | 3; text: string }
  | { t: 'p'; text: string }
  | { t: 'ol' | 'ul'; items: string[] };

function parse(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: 'p', text: para.join(' ') });
    para = [];
  };
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ t: 'h', level: (h[1] ?? '').length <= 2 ? 2 : 3, text: (h[2] ?? '').replace(/\*\*/g, '') });
      continue;
    }
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    if (ol || ul) {
      flush();
      const kind = ol ? 'ol' : 'ul';
      const text = (ol ?? ul)?.[1] ?? '';
      const prev = blocks[blocks.length - 1];
      if (prev && prev.t === kind) prev.items.push(text);
      else blocks.push({ t: kind, items: [text] });
      continue;
    }
    const prev = blocks[blocks.length - 1];
    if (para.length === 0 && prev && (prev.t === 'ol' || prev.t === 'ul') && /^\s{2,}/.test(raw)) {
      prev.items[prev.items.length - 1] += ' ' + line;
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

export function Brief({ text }: { text: string }) {
  const blocks = parse(text);
  return (
    <div className="brief">
      {blocks.map((b, i) => {
        const k = `b${i}`;
        if (b.t === 'h') return b.level === 2 ? <h3 key={k}>{b.text}</h3> : <h4 key={k}>{b.text}</h4>;
        if (b.t === 'p') return <p key={k}>{inline(b.text, k)}</p>;
        const items = b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>);
        return b.t === 'ol' ? <ol key={k}>{items}</ol> : <ul key={k}>{items}</ul>;
      })}
    </div>
  );
}
