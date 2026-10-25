// Shared by the build script (Node) and the browser (for pasted documents).

export interface Chunk {
  doc: string // document title
  heading: string // section heading, or "Part n" for plain text
  text: string
}

/** Markdown: one chunk per "## " section, titled by the "# " heading. */
export function chunkMarkdown(markdown: string, fallbackTitle = 'Document'): Chunk[] {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1].trim() ?? fallbackTitle
  const parts = markdown.split(/^##\s+/m).slice(1)
  if (parts.length === 0) return chunkPlainText(markdown.replace(/^#\s+.+$/m, ''), title)
  return parts.map((part) => {
    const [heading, ...body] = part.split('\n')
    return { doc: title, heading: heading.trim(), text: body.join(' ').replace(/\s+/g, ' ').trim() }
  }).filter((c) => c.text)
}

/** Plain text: group paragraphs into chunks of roughly `size` characters. */
export function chunkPlainText(text: string, title = 'Your document', size = 600): Chunk[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const chunks: Chunk[] = []
  let current = ''
  for (const p of paragraphs) {
    if (current && current.length + p.length > size) {
      chunks.push({ doc: title, heading: `Part ${chunks.length + 1}`, text: current })
      current = ''
    }
    current = current ? `${current} ${p}` : p
  }
  if (current) chunks.push({ doc: title, heading: `Part ${chunks.length + 1}`, text: current })
  return chunks
}

export function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter((s) => s.length > 2) ?? [text]
}
