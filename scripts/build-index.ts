// Pre-computes embeddings for content/*.md so the browser only has to embed the question.
// Run: node scripts/build-index.ts   (Node 22.18+ runs TypeScript directly)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chunkMarkdown } from '../src/chunk.ts'
import { indexChunks } from '../src/search.ts'
import { MODEL, nodeEmbedder } from './embedder.ts'

const root = join(import.meta.dirname, '..')
const round = (v: number[]) => v.map((x) => Math.round(x * 1e4) / 1e4)

const chunks = readdirSync(join(root, 'content'))
  .filter((f) => f.endsWith('.md'))
  .sort()
  .flatMap((f) => chunkMarkdown(readFileSync(join(root, 'content', f), 'utf8'), f))

const indexed = await indexChunks(chunks, await nodeEmbedder())
const index = {
  model: MODEL,
  built: new Date().toISOString(),
  glossary: JSON.parse(readFileSync(join(root, 'content', 'glossary.json'), 'utf8')),
  chunks: indexed.map((c) => ({ ...c, vec: round(c.vec), sentVecs: c.sentVecs.map(round) })),
}
writeFileSync(join(root, 'public', 'index.json'), JSON.stringify(index))
console.log(`indexed ${chunks.length} sections, ${indexed.reduce((n, c) => n + c.sentVecs.length, 0)} sentences`)
