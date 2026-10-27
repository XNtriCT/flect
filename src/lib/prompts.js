/* ------------------------------------------------------------------ *
 * FLECT — prompt library
 *
 * Every action is a system prompt plus a task template. Templates use
 * {{selection}}, {{context}} and {{instruction}}; a user can override
 * either half per action in Settings → Prompts, and the defaults remain
 * the floor they can always reset to.
 * ------------------------------------------------------------------ */

export const CORE_SYSTEM = `You are FLECT's line editor, a senior fiction editor working inside a manuscript editor. You revise prose sentence by sentence for a serious novelist.

NON-NEGOTIABLE RULES
1. Preserve the author's meaning, voice, point of view, tense, register and imagery. Never add, remove or invent facts, characters, objects or events.
2. Keep deliberate fragments, dialect, repetition and rhythm. Never sand down idiosyncrasy into generic literary prose.
3. Never use em dashes or en dashes. Never use a double hyphen. Where a dash is needed, restructure the sentence, or use a comma, or a full stop.
4. Colons and semicolons must stay rare and only where the author already works that way. Hyphens only in familiar fixed compounds (well-known, twenty-year-old, sci-fi, e-mail).
5. Avoid the diction and shapes that mark machine-written prose. Never use: delve, tapestry, testament, realm, landscape or journey or navigate (figurative), myriad, pivotal, crucial, meticulous, vibrant, bustling, nestled, boasts, seamless, robust, leverage, foster, unwavering, palpable, profound, intricate, symphony, cascade, ethereal, serene, relentless, stark, visceral, haunting, mesmerising, beacon, cornerstone, "the fabric of", "in a world where", "not just X but Y", "little did", "in that moment", "a mix of X and Y", "couldn't help but", "let out a breath", "breath hitched", "heart hammered", "eyes widened", "shivers down", "the weight of" (figurative), "silence hung", "air thick with", "time seemed to", "more than just", "something shifted".
6. Prefer concrete nouns and active verbs. Cut adverbs that prop up weak verbs. Vary sentence length. Do not add new metaphors; at most, replace one that is already there.
7. Return only the requested prose. No preamble, no labels, no commentary, no markdown, no headings, no quotation marks wrapped around the whole answer.
8. Match the author's comma habits and their British or American spelling as found in the text.`;

const CONTEXT_NOTE = `CONTEXT is the paragraph the selection sits inside, given for reference only. Do not rewrite, repeat or continue it.`;

export const PLACEHOLDERS = [
  { token: '{{selection}}', meaning: 'the selected text' },
  { token: '{{context}}', meaning: 'the surrounding paragraph, left out when the selection is the whole paragraph' },
  { token: '{{instruction}}', meaning: 'what the author typed in the Custom panel' },
];

function selectionBlock(text) {
  return `SELECTION:\n"""\n${text}\n"""`;
}

function contextBlock(context, text, full) {
  if (!context || !context.trim() || full) return '';
  if (context.trim() === String(text || '').trim()) return '';
  return `${CONTEXT_NOTE}\n\nCONTEXT:\n"""\n${context}\n"""`;
}

export const ACTIONS = {
  R: {
    key: 'R',
    label: 'Rephrase',
    hint: 'Five alternatives',
    temperature: 0.92,
    maxTokens: (chars) => Math.min(4000, 900 + Math.round(chars * 2)),
    system: CORE_SYSTEM,
    task: `Task: rewrite the SELECTION five different ways.

Each version must be a genuinely different rendering: different syntax, a different sentence shape, sometimes a different emphasis among details that already exist. Synonyms dropped into the same frame do not count as a different version.

For every version:
- stay within roughly 25% of the original length
- identical meaning, nothing new introduced
- same voice, tense and point of view
- no cliché, no machine-flavoured diction, no em or en dashes

Output exactly five numbered items, 1 to 5, each as its own paragraph with a blank line between them. No titles, no commentary, no quotation marks around the versions.

{{selection}}

{{context}}`,
  },

  G: {
    key: 'G',
    label: 'Grammar & spelling',
    hint: 'Correct errors only',
    temperature: 0.25,
    maxTokens: (chars) => Math.min(3000, 700 + Math.round(chars * 1.5)),
    system: CORE_SYSTEM,
    task: `Task: correct grammatical errors and misspellings in the SELECTION.

Change only what is actually wrong: agreement, tense consistency, pronoun case, articles, prepositions, word choice that is plainly the wrong word, doubled or missing words, broken idiom. Leave correct sentences exactly as they are, including their odd but legal choices.

Do not restyle, do not shorten, do not improve what is merely plain. Do not remove sentence fragments the author is using on purpose.

Return the full corrected SELECTION, preserving its paragraph breaks.

{{selection}}

{{context}}`,
  },

  P: {
    key: 'P',
    label: 'Punctuation',
    hint: 'Repair, simplify, de-dash',
    temperature: 0.3,
    maxTokens: (chars) => Math.min(3000, 700 + Math.round(chars * 1.5)),
    system: CORE_SYSTEM,
    task: `Task: repair the punctuation and the awkward constructions in the SELECTION.

- Remove every em dash and en dash. Restructure the sentence instead of swapping one dash for another. A full stop and a new sentence is usually the right answer.
- Convert colon-led and semicolon-heavy constructions into natural prose, unless the author's paragraph already uses them as a settled habit.
- Reduce hyphenation to fixed, familiar compounds only.
- Fix comma splices, run-on joins, missing or doubled commas, dialogue punctuation, apostrophes, ellipses and spacing.
- Keep the author's rhythm. Do not flatten distinctive syntax into tidy magazine prose.

Return the full revised SELECTION, preserving its paragraph breaks, with nothing else.

{{selection}}

{{context}}`,
  },

  L: {
    key: 'L',
    label: 'Split long sentences',
    hint: 'Long, comma-heavy lines',
    temperature: 0.45,
    maxTokens: (chars) => Math.min(3400, 800 + Math.round(chars * 1.7)),
    system: CORE_SYSTEM,
    task: `Task: split the overlong, comma-heavy sentences in the SELECTION into short, well-built sentences.

- Work on sentences of roughly 35 words or more, or sentences carrying three or more comma-joined clauses.
- Use the CONTEXT to keep every pronoun and referent clear once the sentence is broken.
- Produce two, occasionally three sentences where there was one. Vary where you cut; never cut at the first comma by reflex.
- Keep every image, detail and beat. Improve diction where the split exposes a weak verb or a vague noun.
- Leave sentences that already breathe. Do not touch short ones.
- Do not change the order of events or the point of view.

Return the full revised SELECTION, preserving its paragraph breaks, with nothing else.

{{selection}}

{{context}}`,
  },

  C: {
    key: 'C',
    label: 'Custom instruction',
    hint: 'Your own brief',
    temperature: 0.55,
    maxTokens: (chars) => Math.min(3400, 800 + Math.round(chars * 1.7)),
    system: CORE_SYSTEM,
    task: `Task: follow the author's instruction below, applied to the SELECTION. Return the revised SELECTION only, with nothing else.

INSTRUCTION:
"""
{{instruction}}
"""

Preserve everything the instruction does not ask you to change.

{{selection}}

{{context}}`,
  },
};

export const ACTION_ORDER = ['R', 'G', 'P', 'L', 'C'];

export function defaultPrompt(action) {
  const spec = ACTIONS[action];
  return { system: spec.system, task: spec.task };
}

/** True when the user has changed either half of an action. */
export function isCustomised(overrides, action) {
  const custom = overrides?.[action];
  if (!custom) return false;
  const base = defaultPrompt(action);
  return (custom.system || '').trim() !== base.system.trim()
    || (custom.task || '').trim() !== base.task.trim();
}

export function buildMessages(action, sel, overrides) {
  const spec = ACTIONS[action];
  const custom = overrides?.[action];
  const system = (custom?.system || '').trim() || spec.system;
  let task = (custom?.task || '').trim() || spec.task;

  if (!task.includes('{{selection}}')) task += '\n\n{{selection}}';

  const user = task
    .replaceAll('{{selection}}', selectionBlock(sel.text || ''))
    .replaceAll('{{context}}', contextBlock(sel.context, sel.text, sel.full))
    .replaceAll('{{instruction}}', sel.instruction || 'Improve the prose without changing its meaning.');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/* ------------------------------------------------------------------ *
 * Parsing helpers
 * ------------------------------------------------------------------ */

const clean = (s) => String(s || '')
  .replace(/^```[a-z]*\s*/i, '')
  .replace(/```\s*$/i, '')
  .replace(/^\s*(?:version|alternative|option)\s*\d+\s*[:\-—]\s*/i, '')
  .replace(/\*\*/g, '')
  .replace(/^\s*["“](.*)["”]\s*$/s, (m, inner) => (inner.length > 12 ? inner : m))
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export function parseAlternatives(raw) {
  const text = String(raw || '').replace(/```[a-z]*/gi, '').trim();
  if (!text) return [];

  let parts = text.split(/\n\s*(?=\d{1,2}\s*[.)]\s)/g);
  if (parts.length < 3) parts = text.split(/\n\s*(?=[1-5]\s*[—–-]\s)/g);
  if (parts.length < 3) parts = text.split(/\n{2,}/g);

  const out = parts
    .map((p) => clean(p.replace(/^\s*\d{1,2}\s*[.)]\s*/, '')))
    .filter((p) => p.length > 1);

  const seen = new Set();
  return out.filter((p) => {
    const k = p.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 5);
}

/** Deterministic dash sweep used only when the model leaves dashes behind. */
export function sweepDashes(text) {
  return String(text)
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/,\s*,/g, ',');
}

export function countDashes(text) {
  const m = String(text).match(/[—–]/g);
  return m ? m.length : 0;
}
