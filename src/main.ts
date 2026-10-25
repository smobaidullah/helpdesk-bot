import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import './style.css'
import { chunkMarkdown, chunkPlainText } from './chunk.ts'
import { expandQuery, extractAnswer, indexChunks, MIN_SCORE, topK, type Embedder, type Hit, type IndexedChunk } from './search.ts'
import { askGemini } from './gemini.ts'

env.allowLocalModels = false

// pipeline()'s overloads are too complex for tsc to infer here, so pin the one we use.
const loadExtractor = pipeline as unknown as (task: 'feature-extraction', model: string, options: object) => Promise<FeatureExtractionPipeline>

interface KnowledgeBase {
  name: string
  chunks: IndexedChunk[]
  glossary: Record<string, string>
  fallback: string
  suggestions: string[]
}

const DEMO_SUGGESTIONS = [
  'How much is a membership?',
  'Can I pause my membership?',
  'I lost my key fob',
  'Is the gym open at 3am?',
  'What does it cost to leave early?',
  'Do you have childcare?',
]

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T
const messages = $<HTMLDivElement>('#messages')
const form = $<HTMLFormElement>('#ask')
const input = $<HTMLInputElement>('#question')
const status = $<HTMLDivElement>('#status')

let embedder: Embedder | null = null
let demo: KnowledgeBase | null = null
let kb: KnowledgeBase | null = null
let geminiKey = '' // kept in memory only, never saved

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function addMessage(role: 'user' | 'bot', html: string) {
  const el = document.createElement('div')
  el.className = `msg ${role}`
  el.innerHTML = html
  messages.append(el)
  messages.scrollTop = messages.scrollHeight
  return el
}

function sourcesHtml(hits: Hit[]) {
  const items = hits
    .filter((h) => h.score >= MIN_SCORE - 0.05)
    .map((h) => `
      <details>
        <summary>${esc(h.chunk.doc)} › ${esc(h.chunk.heading)} <span class="score">${Math.round(h.score * 100)}% match</span></summary>
        <p>${esc(h.chunk.text)}</p>
      </details>`)
    .join('')
  return items ? `<div class="sources"><div class="sources-label">Sources</div>${items}</div>` : ''
}

function renderSuggestions() {
  const box = $<HTMLDivElement>('#suggestions')
  box.innerHTML = (kb?.suggestions ?? []).map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join('')
  box.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) =>
    b.addEventListener('click', () => {
      input.value = b.textContent ?? ''
      form.requestSubmit()
    }),
  )
}

function setKnowledgeBase(next: KnowledgeBase, intro: string) {
  kb = next
  $<HTMLSpanElement>('#kb-name').textContent = next.name
  $<HTMLButtonElement>('#back-to-demo').hidden = next === demo
  messages.innerHTML = ''
  addMessage('bot', intro)
  renderSuggestions()
}

async function answer(question: string) {
  if (!embedder || !kb) return
  addMessage('user', esc(question))
  const thinking = addMessage('bot', '<span class="typing"><i></i><i></i><i></i></span>')

  try {
    const [queryVec] = await embedder([expandQuery(question, kb.glossary)])
    const hits = topK(queryVec, kb.chunks, 3)
    const best = hits[0]

    if (!best || best.score < MIN_SCORE) {
      thinking.innerHTML = `I couldn't find that in ${esc(kb.name)}'s information, so I'd rather not guess. ${kb.fallback}`
      return
    }

    let reply: string
    let mode: string
    if (geminiKey) {
      reply = esc(await askGemini(geminiKey, question, hits.map((h) => h.chunk))).replace(/\n/g, '<br>')
      mode = 'Written by Gemini from the sources below'
    } else {
      reply = esc(extractAnswer(queryVec, best))
      mode = 'Quoted from the best-matching section'
    }
    thinking.innerHTML = `<p>${reply}</p><div class="mode">${mode}</div>${sourcesHtml(hits)}`
  } catch (err) {
    console.error(err)
    thinking.innerHTML = `Something went wrong: ${esc(err instanceof Error ? err.message : String(err))}`
  }
  messages.scrollTop = messages.scrollHeight
}

form.addEventListener('submit', (e) => {
  e.preventDefault()
  const q = input.value.trim()
  if (!q) return
  input.value = ''
  void answer(q)
})

// ---- bring your own document ----
$<HTMLFormElement>('#own-doc').addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!embedder) return
  const text = $<HTMLTextAreaElement>('#doc-text').value.trim()
  const name = $<HTMLInputElement>('#doc-name').value.trim() || 'Your document'
  if (text.length < 80) {
    $<HTMLDivElement>('#doc-status').textContent = 'Paste a bit more text: at least a paragraph or two.'
    return
  }
  $<HTMLDivElement>('#doc-status').textContent = 'Reading and indexing your document...'
  const chunks = /^##\s/m.test(text) ? chunkMarkdown(text, name) : chunkPlainText(text, name)
  const indexed = await indexChunks(chunks.map((c) => ({ ...c, doc: name })), embedder)
  $<HTMLDivElement>('#doc-status').textContent = `Indexed ${indexed.length} sections. Ask away.`
  setKnowledgeBase(
    { name, chunks: indexed, glossary: {}, fallback: 'Try rephrasing, or check the document directly.', suggestions: [] },
    `I've read <b>${esc(name)}</b> (${indexed.length} sections). It stays in your browser and isn't uploaded anywhere. What would you like to know?`,
  )
  input.focus()
})

$<HTMLInputElement>('#doc-file').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  $<HTMLTextAreaElement>('#doc-text').value = await file.text()
  $<HTMLInputElement>('#doc-name').value = file.name.replace(/\.(txt|md)$/i, '')
})

$<HTMLButtonElement>('#back-to-demo').addEventListener('click', () => {
  if (demo) setKnowledgeBase(demo, 'Back to the Tidewater Fitness help desk. What can I help with?')
})

// ---- optional Gemini key ----
$<HTMLFormElement>('#gemini').addEventListener('submit', (e) => {
  e.preventDefault()
  const field = $<HTMLInputElement>('#gemini-key')
  geminiKey = field.value.trim()
  field.value = ''
  $<HTMLDivElement>('#gemini-status').textContent = geminiKey
    ? 'Gemini is on for this tab. The key is only in memory and is gone when you close or reload.'
    : 'Gemini is off. Answers are quoted from the documents.'
})

// ---- start up ----
async function init() {
  status.textContent = 'Loading the language model (about 23 MB, only the first time)...'
  const [extractor, index] = await Promise.all([
    loadExtractor('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'q8',
      progress_callback: (p: { status: string; progress?: number }) => {
        if (p.status === 'progress' && p.progress) status.textContent = `Loading the language model... ${Math.round(p.progress)}%`
      },
    }),
    fetch(`${import.meta.env.BASE_URL}index.json`).then((r) => r.json()),
  ])

  embedder = async (texts) => (await extractor(texts, { pooling: 'mean', normalize: true })).tolist() as number[][]
  demo = {
    name: 'Tidewater Fitness',
    chunks: index.chunks,
    glossary: index.glossary,
    fallback: 'You can call reception on 09 555 0142 or email hello@tidewaterfitness.example.',
    suggestions: DEMO_SUGGESTIONS,
  }
  status.textContent = ''
  input.disabled = false
  form.querySelector('button')!.disabled = false
  $<HTMLButtonElement>('#own-doc button').disabled = false
  setKnowledgeBase(demo, "Kia ora! I'm the Tidewater Fitness help desk. Ask me about memberships, prices, cancelling, classes, opening hours and more.")
  input.focus()
}

init().catch((err) => {
  console.error(err)
  status.textContent = 'The model could not load. Check your connection and reload the page.'
})
