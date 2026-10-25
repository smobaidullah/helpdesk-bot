import { pipeline } from '@huggingface/transformers'
import type { Embedder } from '../src/search.ts'

export const MODEL = 'Xenova/all-MiniLM-L6-v2'

export async function nodeEmbedder(): Promise<Embedder> {
  const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' })
  return async (texts) => {
    const out = await extractor(texts, { pooling: 'mean', normalize: true })
    return out.tolist() as number[][]
  }
}
