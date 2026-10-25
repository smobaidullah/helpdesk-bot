import type { Chunk } from './chunk.ts'

// Google's free-tier model. Called straight from the browser with the visitor's own key.
const MODEL = 'gemini-2.5-flash'

export async function askGemini(key: string, question: string, sources: Chunk[]): Promise<string> {
  const context = sources.map((c, i) => `[${i + 1}] ${c.doc} > ${c.heading}\n${c.text}`).join('\n\n')
  const prompt = `You are a friendly help-desk assistant for a business. Answer the customer's question using ONLY the sources below.
If the sources don't contain the answer, say you don't know and suggest contacting the business. Never invent prices, times or policies.
Keep it to 2-4 short sentences, in plain words.

Sources:
${context}

Customer question: ${question}`

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.error?.message ?? `Gemini returned ${res.status}`)
  }
  const data = await res.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
  if (!text) throw new Error('Gemini returned an empty answer')
  return text.trim()
}
