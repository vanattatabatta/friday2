"use strict";
const { groqFetch, hasKeys } = require("./groqKeys");   // key pool: up to 10 Groq keys, switched automatically
/*
 * AI-writing checker. Returns, per sentence, the estimated probability that it was machine-written,
 * plus an overall "% AI / % human" split (share of words in sentences scored >= 50%).
 *
 * Signals (always on, no API needed): stock "LLM" vocabulary and transitions, uniform sentence length
 * (low burstiness), formal vocabulary, and the absence of human markers (contractions, first person,
 * questions, concrete numbers/quotes). If GROQ_API_KEY is set, a language model also scores each
 * sentence and the two are averaged.
 *
 * IMPORTANT: this is a statistical estimate, not proof. Formal human writing can score high and
 * paraphrased AI text can score low; the UI says so and it must not be used as sole evidence.
 */
const MIN_WORDS = 20;           // about two lines; under ~80 words the result is flagged as less reliable
const RELIABLE_WORDS = 80;
const MAX_CHARS = 25000;
const LLM_MAX_SENTENCES = 80;

const PHRASES = [
  /\b(delve[sd]?|delving|tapestry|testament|multifaceted|pivotal|paramount|intricate|nuanced|myriad|plethora|realm|landscape|ever[- ]evolving|cutting[- ]edge|game[- ]chang\w+|holistic|robust|seamless(ly)?|synerg\w+|underscor\w+|foster(s|ed|ing)?|leverag\w+|harness(es|ed|ing)?|streamlin\w+|elevat\w+|embark\w*|unlock\w*|navigat\w+|comprehensive|meticulous\w*|vibrant|bustling|beacon|cornerstone|bedrock|interplay|commendable|noteworthy|invaluable|transformative|groundbreaking|shed(s|ding)? light)\b/i,
  /\b(it is (important|crucial|essential|worth) (to note|noting|to remember|to recognize|to understand)|it should be noted|plays? an? (crucial|vital|pivotal|significant|key|important) role|a (wide|diverse|broad) (range|array|variety|spectrum) of|in today'?s (fast[- ]paced|digital|modern|rapidly|world|society)|in the (realm|world|field|context) of|the importance of|serves? as a (testament|reminder)|not only .{3,80} but also|in (conclusion|summary)|to (conclude|summarize)|this (essay|paper|article|study) (will|aims|explores|examines|discusses)|a (deeper|better|comprehensive) understanding|(significant|profound|lasting) (impact|implications?)|stands? as|paves? the way|rapidly (evolving|changing)|(key|main) takeaways?|when it comes to|at the end of the day|moving forward|by (understanding|leveraging|fostering|embracing))\b/i
];
const TRANSITION = /^\s*["“(]?(moreover|furthermore|additionally|in addition|consequently|therefore|thus|hence|overall|in conclusion|to conclude|in summary|to summarize|ultimately|nevertheless|nonetheless|notably|importantly|similarly|likewise|as a result|in essence|in particular|in light of|with that said|that said|first(ly)?|second(ly)?|third(ly)?|finally|lastly|however)\b/i;
const CONTRACTION = /\b(\w+n['’]t|\w+['’](re|ve|ll|d|m)|it['’]s|that['’]s|there['’]s|what['’]s|let['’]s|he['’]s|she['’]s)\b/i;
const FIRST_PERSON = /\b(i|i['’]m|i['’]ve|i['’]d|my|me|mine|myself|we|our|us)\b/i;
const INFORMAL = /\b(lol|kinda|sorta|gonna|wanna|gotta|yeah|yep|nope|okay|ok|stuff|dunno|tbh|btw|honestly|basically|literally|pretty much|a bit|a lot|guys|super|totally|crazy|awesome|boring|weird|annoying)\b/i;
const EMDASH = /\S[\u2014]\S/, NBHYPH = /[\u2011\u2010]/, SEMI = /;\s/, BALANCE = /\b(while|whereas|although|though)\b.{8,}?,\s|\b(both|each|either)\b.{3,80}\b(and|but|yet)\b|\bvs\.?\b|\bnot (only|solely|merely)\b/i;
const isHeading = (s) => { const t = s.trim(); return wordsOf(t).length <= 9 && !/[.!?]"?”?$/.test(t); };
const CONCRETE = /\d|["“”]/;

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wordsOf = (s) => s.match(/[A-Za-z0-9\u00C0-\u024F][A-Za-z0-9\u00C0-\u024F'’-]*/g) || [];
const ABBR = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e|cf|al|Fig|No|St|Inc|Ltd|U\.S|U\.K)\.$/i;

/* Split into sentences, keeping every character (whitespace stays attached) so the pieces re-join into the original text. */
function splitSentences(text) {
  const out = [], re = /([.!?]+["')\]”’]*)(\s+)|(\n+)/g;
  let start = 0, m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    if (m[3] === undefined) {
      const next = text[end];
      if (!/\n/.test(m[2]) && next && !/[A-Z0-9"'“‘(\[]/.test(next)) continue;
      if (ABBR.test(text.slice(start, m.index + m[1].length))) continue;
    }
    out.push(text.slice(start, end)); start = end;
  }
  if (start < text.length) out.push(text.slice(start));
  return out.filter((s) => s.length);
}

function heuristicLogits(sents) {
  const lens = sents.map((s) => wordsOf(s).length);
  const usable = lens.filter((n) => n >= 4);
  const mean = usable.reduce((a, b) => a + b, 0) / (usable.length || 1);
  const std = Math.sqrt(usable.reduce((a, b) => a + (b - mean) ** 2, 0) / (usable.length || 1)) || 1;
  const cv = std / (mean || 1);
  // very even sentence lengths push everything toward "AI", but with only a few sentences "even" means nothing, so fade the effect in
  const docShift = clamp((0.5 - cv) * 4.2, -1.5, 1.8) * Math.min(1, usable.length / 6);
  return sents.map((s, i) => {
    const n = lens[i];
    if (n < 4) return null; // too short to judge
    if (isHeading(s)) return "H"; // titles/headings: scored from their neighbours later
    const w = wordsOf(s);
    const hits = PHRASES.reduce((c, re) => c + (re.test(s) ? 1 : 0), 0);
    const longRatio = w.filter((x) => x.length >= 9).length / n;
    const lenZ = Math.abs(n - mean) / std;
    let z = -0.7 + docShift;
    z += 1.1 * Math.min(hits, 3);
    z += TRANSITION.test(s) ? 0.8 : 0;
    z += (EMDASH.test(s) ? 0.55 : 0) + (NBHYPH.test(s) ? 0.45 : 0) + (SEMI.test(s) ? 0.3 : 0) + (BALANCE.test(s) ? 0.45 : 0);
    z += n >= 14 && n <= 34 ? 0.45 : 0;
    z += 0.7 * (0.6 - Math.min(lenZ, 1.8) / 1.8 * 1.2);
    z += clamp(4 * (longRatio - 0.12), -0.7, 0.9);
    if (CONTRACTION.test(s)) z -= 1.2;
    if (FIRST_PERSON.test(s)) z -= 0.9;
    if (INFORMAL.test(s)) z -= 1.0;
    if (/[?!]|\.\.\./.test(s)) z -= 0.7;
    z += CONCRETE.test(s) || /[a-z,;]\s+[A-Z][a-z]+/.test(s) ? -0.5 : 0.25; // names, numbers, quotes = concrete; none = generic
    return z;
  });
}

async function llmScores(sents) {
  if (!hasKeys() || sents.length > LLM_MAX_SENTENCES) return null;
  const list = sents.map((s, i) => `${i + 1}. ${s.trim().replace(/\s+/g, " ").slice(0, 400)}`).join("\n");
  const body = {
    model: process.env.DETECT_MODEL || "openai/gpt-oss-20b",   // free model, separate rate-limit bucket from the live chat
    temperature: 0, max_tokens: 2500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `You are a careful AI-writing detector. For each numbered sentence estimate the probability (0 to 1) that a large language model wrote it rather than a person. Judge stock phrasing, genericness, hedging, over-tidy structure and lack of personal or concrete detail. Polished, evenly structured, generic expository writing (essays, reports, bullet-point overviews with stock transitions) is very likely machine-written; casual, specific, idiosyncratic or imperfect writing is usually human. Reply with JSON only: {"scores":[...]} holding exactly ${sents.length} numbers in order.` },
      { role: "user", content: list }
    ]
  };
  if (/^openai\/gpt-oss/.test(body.model)) body.reasoning_effort = "low";
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await groqFetch(body, { signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    const arr = JSON.parse(j.choices[0].message.content).scores;
    if (!Array.isArray(arr) || arr.length !== sents.length || arr.some((x) => typeof x !== "number" || x < 0 || x > 1)) return null;
    return arr;
  } catch (e) { return null; } finally { clearTimeout(t); }
}

async function analyze(rawText) {
  const text = String(rawText || "").replace(/^[ \t]*[•▪●◦‣\-\*][ \t]+/gm, "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, MAX_CHARS);
  const total = wordsOf(text).length;
  if (total < MIN_WORDS) throw Object.assign(new Error(`Please enter at least ${MIN_WORDS} words, about two lines (you have ${total}).`), { status: 400 });

  const sents = splitSentences(text);
  const zr = heuristicLogits(sents);
  const defined = zr.filter((v) => typeof v === "number");
  const meanZ = defined.reduce((a, b) => a + b, 0) / (defined.length || 1);
  // headings take the average of the body, so a title never drags a long essay down on its own
  const z = zr.map((v) => (v === "H" ? meanZ : v));
  // AI text is consistent across a passage: neighbours smooth each sentence, and when the whole document leans one way
  // that lean is amplified (this is what makes a fully machine-written essay score near the top, like Turnitin / ZeroGPT)
  const docShift = clamp(meanZ * 0.7, -1.2, 1.2) * Math.min(1, defined.length / 8);
  const zs = z.map((v, i) => {
    if (v == null) return null;
    const a = z[i - 1] != null ? z[i - 1] : v, b = z[i + 1] != null ? z[i + 1] : v;
    return (0.6 * v + 0.2 * a + 0.2 * b) * 1.1 + docShift;
  });
  let p = zs.map((v) => (v == null ? null : sigmoid(v)));

  const judged = sents.map((s, i) => i).filter((i) => p[i] != null);
  const llm = await llmScores(judged.map((i) => sents[i]));
  if (llm) judged.forEach((i, k) => { p[i] = llm[k] >= p[i] ? 0.5 * p[i] + 0.5 * llm[k] : 0.88 * p[i] + 0.12 * llm[k]; }); // the model can raise a score, but only nudge it down

  let aiWords = 0, allWords = 0;
  const out = sents.map((s, i) => {
    const n = wordsOf(s).length;
    if (p[i] != null) { allWords += n; if (p[i] >= 0.5) aiWords += n; }
    return { t: s, p: p[i] == null ? null : Math.round(p[i] * 100) / 100 };
  });
  const ai = allWords ? Math.round((aiWords / allWords) * 100) : 0;
  const label = ai >= 80 ? "Likely AI-generated" : ai >= 50 ? "Mixed: probably AI-assisted" : ai >= 20 ? "Mostly human with some AI-like passages" : "Likely human-written";
  const feedback = ai >= 70 ? "Your text is likely AI/GPT generated" : ai >= 40 ? "Your text may include parts generated by AI/GPT" : ai >= 15 ? "Your text is most likely human written, with a few AI-like passages" : "Your text is likely human written";
  return { ai_percent: ai, human_percent: 100 - ai, label, feedback, characters: text.length, words: total, short: total < RELIABLE_WORDS, flagged: out.filter((x) => x.p != null && x.p >= 0.5).length, method: llm ? "hybrid" : "heuristic", sentences: out };
}

module.exports = { heuristicLogits, analyze, splitSentences, MIN_WORDS, RELIABLE_WORDS };
