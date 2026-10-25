import type { Chunk } from './chunk.ts'
import { splitSentences } from './chunk.ts'

export interface IndexedChunk extends Chunk {
  vec: number[] // whole section
  sentVecs: number[][] // one per sentence, in order
}

export interface Hit {
  chunk: IndexedChunk
  score: number
  bestSentence: number
}

/** Anything that turns texts into normalised vectors (transformers.js in practice). */
export type Embedder = (texts: string[]) => Promise<number[][]>

// Below this similarity the best match is probably not about the question.
export const MIN_SCORE = 0.4
// Weight of whole-section similarity vs best single sentence (tuned with scripts/eval.ts).
const BLEND = 0.7

const dot = (a: number[], b: number[]) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/**
 * Rewrite the customer's words into the business's words before searching,
 * e.g. "key fob" -> "key fob (access tag)". Keeps the original so nothing is lost.
 */
export function expandQuery(question: string, glossary: Record<string, string>): string {
  let q = question
  for (const [word, term] of Object.entries(glossary)) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (re.test(q)) q = q.replace(re, (m) => `${m} (${term})`)
  }
  return q
}

/**
 * A section's score is its whole-section similarity or its best single
 * sentence, whichever is higher. Short, specific questions often match one
 * sentence much better than the section as a whole.
 */
export function topK(queryVec: number[], chunks: IndexedChunk[], k = 4): Hit[] {
  return chunks
    .map((chunk) => {
      let bestSentence = 0
      let sentScore = -1
      chunk.sentVecs.forEach((v, i) => {
        const s = dot(queryVec, v)
        if (s > sentScore) [sentScore, bestSentence] = [s, i]
      })
      return { chunk, bestSentence, score: BLEND * dot(queryVec, chunk.vec) + (1 - BLEND) * sentScore }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

/**
 * Extractive answer from the best section: its most relevant sentence, plus
 * the runner-up if it's nearly as relevant, kept in their original order.
 */
export function extractAnswer(queryVec: number[], hit: Hit): string {
  const sentences = splitSentences(hit.chunk.text)
  if (sentences.length <= 2) return sentences.join(' ')
  const ranked = hit.chunk.sentVecs
    .map((v, i) => ({ i, score: dot(queryVec, v) }))
    .sort((a, b) => b.score - a.score)
  const keep = ranked.filter((r, n) => n === 0 || (n === 1 && r.score > ranked[0].score - 0.08))
  return keep.sort((a, b) => a.i - b.i).map((r) => sentences[r.i]).join(' ')
}

/** Embed every section and every sentence. Used at build time and for pasted documents. */
export async function indexChunks(chunks: Chunk[], embed: Embedder): Promise<IndexedChunk[]> {
  const sectionVecs = await embed(chunks.map((c) => `${c.heading}: ${c.text}`))
  const sentenceLists = chunks.map((c) => splitSentences(c.text))
  const flat = await embed(sentenceLists.flat())
  let n = 0
  return chunks.map((c, i) => ({
    ...c,
    vec: sectionVecs[i],
    sentVecs: sentenceLists[i].map(() => flat[n++]),
  }))
}
