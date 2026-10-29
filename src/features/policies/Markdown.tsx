import type { ReactNode } from 'react'

/** Inline **bold** and *italic* only. Text is rendered as React text nodes — never as HTML. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const token = m[0]
    out.push(token.startsWith('**') ? <strong key={i++}>{token.slice(2, -2)}</strong> : <em key={i++}>{token.slice(1, -1)}</em>)
    last = m.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Minimal, safe Markdown: `## headings`, `- lists`, paragraphs, bold/italic. */
export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r/g, '').split(/\n{2,}/)
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {blocks.map((block, bi) => {
        const lines = block.split('\n')
        const first = lines[0] ?? ''
        if (/^#{1,3}\s/.test(first)) {
          const rest = lines.slice(1).join(' ').trim()
          return (
            <div key={bi}>
              <h2 className="text-ink mt-2 text-base font-semibold">{first.replace(/^#+\s*/, '')}</h2>
              {rest && <p className="text-ink-soft mt-1">{inline(rest)}</p>}
            </div>
          )
        }
        if (lines.every((l) => /^\s*[-*]\s/.test(l))) {
          return (
            <ul key={bi} className="text-ink-soft list-disc space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*]\s/, ''))}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={bi} className="text-ink-soft">
            {inline(lines.join(' '))}
          </p>
        )
      })}
    </div>
  )
}
