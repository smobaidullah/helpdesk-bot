// Checks that realistic questions retrieve the right section.
// Run: node scripts/eval.ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expandQuery, MIN_SCORE, topK, type IndexedChunk } from '../src/search.ts'
import { nodeEmbedder } from './embedder.ts'

const root = join(import.meta.dirname, '..')
const index = JSON.parse(readFileSync(join(root, 'public', 'index.json'), 'utf8'))
const chunks: IndexedChunk[] = index.chunks

// question -> expected section heading (null = should say "not in the docs").
// The second block was written after tuning, as a check that the fixes generalise.
const CASES: [string, string | null][] = [
  ['how much is it per week?', 'Membership options'],
  ['can I quit before my contract ends', 'Cancelling during a 12-month term'],
  ['what does it cost to leave early', 'Cancelling during a 12-month term'],
  ['I broke my leg, can I pause my membership?', 'Freezing your membership'],
  ['is there a discount for uni students', 'Student and senior discounts'],
  ['can I bring my friend to work out', 'Guest passes'],
  ['what time do you open on sunday', 'Staffed hours'],
  ['is the gym open at 3am', '24/7 access'],
  ['where do I park my car', 'Parking'],
  ['I lost my key fob', 'Lost access tags'],
  ['how do I book a spin class', 'Booking a class'],
  ['what happens if I miss a class I booked', 'Late cancellations and no-shows'],
  ['how much is a PT session', 'Prices'],
  ['do you have childcare', 'Creche'],
  ['my direct debit bounced', 'Payment'],
  ['do you have a swimming pool', null],
  ['what is the capital of france', null],
  // held out
  ['can my 15 year old son join', 'Age limits'],
  ['I am moving to another city, do I still pay the exit fee', 'Moving away or medical reasons'],
  ['can I give my membership to my sister', 'Transferring a membership'],
  ['do I need to bring a towel', 'Towels and hygiene'],
  ['how long do you keep CCTV', 'Privacy'],
  ['is yoga good for beginners', 'Beginners'],
  ['do you sell protein shakes', null],
]

const embed = await nodeEmbedder()
const vecs = await embed(CASES.map(([q]) => expandQuery(q, index.glossary)))

let pass = 0
CASES.forEach(([q, expected], i) => {
  const [best] = topK(vecs[i], chunks, 1)
  const answered = best.score >= MIN_SCORE ? best.chunk.heading : null
  const ok = answered === expected
  if (ok) pass++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${best.score.toFixed(2)}  "${q}" -> ${answered ?? '(no answer)'}${ok ? '' : `   expected: ${expected ?? '(no answer)'}`}`)
})
console.log(`\n${pass}/${CASES.length} correct`)
// CI gate: fail if accuracy drops below 85%
process.exitCode = pass / CASES.length >= 0.85 ? 0 : 1
