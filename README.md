# Help Desk Bot

A website help-desk chatbot that answers customers from a business's own documents. Every answer shows its sources, and when the documents don't cover a question the bot says so instead of making something up.

**Live demo:** https://smobaidullah.github.io/helpdesk-bot/

The demo is set up for Tidewater Fitness, a made-up gym with seven documents covering prices, cancellations, hours, classes, personal training, guests and policies. You can also paste your own document into the page and ask questions about it.

## How it works

1. **Indexing** (`scripts/build-index.ts`, at build time): documents in `content/` are split into sections, and every section and every sentence is turned into an embedding with `all-MiniLM-L6-v2` (via transformers.js). The result is a static `index.json`.
2. **Matching** (`src/search.ts`, in the browser): the question is embedded with the same model, running locally in the browser. Each section is scored by a blend of whole-section similarity and its best single sentence, because short questions often match one sentence better than the whole section.
3. **Customer words vs business words**: a small glossary (`content/glossary.json`) maps what customers say to what the documents say, e.g. "key fob" → "access tag" and "pause" → "freeze".
4. **Answering**: by default the bot quotes the most relevant sentence or two from the best section. Below a confidence threshold it says it doesn't know and gives the contact details instead. Optionally, a visitor can paste a free Gemini API key and Gemini writes the answer, constrained to the matched sources only.

Nothing typed into the page is sent to a server unless the Gemini option is turned on.

## Accuracy

`scripts/eval.ts` runs 24 realistic customer questions, including ones that should get "I don't know", and checks which section each one lands on. Six of them were written after tuning, to check the tuning generalises.

Current result: **21/24 correct**. Of the three misses, one returns "I don't know" (the safe failure), and one finds a closely related section with the right section listed among its sources. The deploy workflow re-runs this check and stops the deploy if accuracy drops below 85%.

## Run locally

```bash
npm install
npm run index   # embed content/ into public/index.json
npm run eval    # accuracy check
npm run dev
```

To use it for a different business, replace the Markdown files in `content/` (one `# Title` per file, one `## Section` per topic), update `glossary.json`, add test questions to `scripts/eval.ts`, and re-run `npm run index`.

## Tech

TypeScript, Vite, transformers.js (ONNX Runtime Web), optional Gemini API. Hosted free on GitHub Pages.
