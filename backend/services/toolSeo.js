"use strict";
/*
 * Crawlable tool pages. /tools/* used to be one shared tools.html whose title, <h1>, description and text were all written by
 * JavaScript, so a crawler saw eight identical empty pages. Here each tool gets its own <title>, meta description, canonical,
 * Open Graph tags, JSON-LD (WebApplication + FAQPage + BreadcrumbList), a real <h1>, real navigation links and a block of
 * readable HTML text (what it does, how to use it, FAQ) in the FIRST response, before any script runs.
 */
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const TOOLS = {
  "/tools/document-creator": {
    name: "Document Creator", h1: "Document Creator", sub: "Describe your topic and get a complete, structured first draft in one click.",
    title: "AI Document Creator: Essay, Report & Expert Draft Generator",
    desc: "Type a topic and get a structured first draft with headings, an introduction, body sections and a conclusion. Edit it, copy it or download it. First try free.",
    cat: "WritingApplication",
    about: ["The Document Creator turns a topic or a short brief into a complete first draft: a title, an introduction, organised sections with headings, and a conclusion. It is built for the blank-page moment, when you know what the expert is about but have not started writing.",
            "The draft is plain editable text. Use it as an outline to build on, as a structure to rewrite in your own words, or as a checklist of the points your document should cover."],
    steps: ["Type the topic, question or instructions you were given.", "Choose the type of document and the length you need.", "Press Generate and read the draft that appears.", "Copy it, download it, or paste it into your editor and make it your own."],
    faq: [["Is the draft ready to hand in?", "Treat it as a first draft. Check the facts, add your own analysis and sources, and follow your institution's rules on AI assistance."],
          ["How much does it cost?", "Your first use is free with no sign-up. After that the $30/month plan unlocks every service on the site."],
          ["What file types can I download?", "The result can be copied as text or saved as a plain text or Word-compatible file."]]
  },
  "/tools/ocr": {
    name: "Image & PDF to Text", h1: "Image & PDF to Text", sub: "Upload a photo, scan or PDF and get editable text automatically.",
    title: "Image to Text & PDF to Text Converter (Free OCR Online)",
    desc: "Upload a photo, screenshot, scan or PDF and get editable, copyable text back. Optical character recognition for notes, textbooks and printed pages.",
    cat: "UtilitiesApplication",
    about: ["Image & PDF to Text uses optical character recognition (OCR) to read the words in a picture or a scanned document and give them back as text you can edit, search and copy.",
            "It works on photos of handwritten-style notes that are clearly written, printed textbook pages, screenshots, scanned handouts and PDFs that contain page images instead of real text."],
    steps: ["Upload an image (JPG, PNG, WebP) or a PDF.", "Wait a few seconds while each page is read.", "Review the extracted text and fix any characters the scan made unclear.", "Copy the text or save it as a file."],
    faq: [["Which files are supported?", "Common image formats and PDFs. Clear, well-lit, straight-on pictures give the most accurate text."],
          ["Why are some words wrong?", "Blurry photos, shadows, small print and unusual fonts reduce accuracy. Retaking the picture in good light usually helps."],
          ["Is my file stored?", "The file is used to produce the text for your request. Do not upload documents containing passwords, bank details or other sensitive personal data."]]
  },
  "/tools/diagram": {
    name: "Diagram Generator", h1: "Diagram Generator", sub: "Describe a process or paste Mermaid code and get a live diagram.",
    title: "Diagram Generator: Flowcharts & Process Diagrams from Text (Mermaid)",
    desc: "Describe a process in plain words, or paste Mermaid code, and get a flowchart or diagram you can view, edit and save instantly.",
    cat: "DesignApplication",
    about: ["The Diagram Generator draws flowcharts, sequence diagrams and other process diagrams from a short description. It writes Mermaid code for you and renders it live, so you can see the result and change it straight away.",
            "If you already know Mermaid, paste your own code and the diagram updates as you edit. This is handy for lab reports, business studies, computer science and project experts."],
    steps: ["Describe the process, for example: a customer places an order, payment is checked, the order ships.", "Press Generate to get the diagram and its Mermaid code.", "Edit the code to rename boxes or add steps; the picture refreshes.", "Save the diagram or copy the code into your document."],
    faq: [["What is Mermaid?", "Mermaid is a simple text format for diagrams. A line such as A --> B draws an arrow from box A to box B."],
          ["Can I edit the result?", "Yes. The code is shown next to the diagram and the picture updates when you change it."],
          ["What diagram types work best?", "Flowcharts and process diagrams are the most reliable. Sequence, state and simple class diagrams also work."]]
  },
  "/tools/grammar-checker": {
    name: "Grammar Checker", h1: "Grammar Checker", sub: "Paste your text and get every grammar and punctuation mistake fixed automatically.",
    title: "Free Grammar Checker: Fix Grammar & Punctuation Errors Online",
    desc: "Paste your essay, email or expert and get grammar, punctuation and sentence errors corrected instantly, with each change explained. First try free.",
    cat: "EducationalApplication",
    about: ["The Grammar Checker reads your text and corrects grammar and punctuation mistakes: subject-verb agreement, wrong tenses, missing commas, run-on sentences, misused articles and prepositions, and more.",
            "It keeps your meaning and your voice. You get the corrected text plus a list of what was changed, so you learn the rule instead of just accepting a fix."],
    steps: ["Paste your text into the box.", "Press Check grammar.", "Read the corrected version and the list of changes.", "Copy the corrected text or run it through the Proofreader for a final pass."],
    faq: [["Does it rewrite my sentences?", "No. It fixes errors and leaves your wording alone. If you want new wording, use the Paraphraser."],
          ["How long can the text be?", "Essay-length passages work well. Split very long documents into sections for the best result."],
          ["Is it free?", "Your first use is free with no sign-up. The $30/month plan covers unlimited use of every service."]]
  },
  "/tools/spell-checker": {
    name: "Spell Checker", h1: "Spell Checker", sub: "Catch typos and misspelled words in seconds, with each fix listed.",
    title: "Online Spell Checker: Find & Fix Spelling Mistakes Fast",
    desc: "Paste any text to catch typos, misspelled words and commonly confused words. Every correction is listed so you can see exactly what changed.",
    cat: "EducationalApplication",
    about: ["The Spell Checker finds typos, misspelled words and mix-ups such as their / there, affect / effect and its / it's. Every correction is shown in a list, so nothing changes silently.",
            "Names, technical terms and quotations are left as written whenever the context shows they are intentional."],
    steps: ["Paste your text.", "Press Check spelling.", "Review the corrected text and the list of fixes.", "Copy the result into your document."],
    faq: [["Does it support British and American spelling?", "It keeps the spelling style your text already uses, so colour stays colour and color stays color."],
          ["Will it change technical words?", "It tries not to. Specialist terms, names and quoted material are preserved when they look deliberate."],
          ["What about grammar?", "Use the Grammar Checker for grammar and punctuation, or the Proofreader to check everything in one pass."]]
  },
  "/tools/proofreader": {
    name: "Proofreader", h1: "Proofreader", sub: "One pass for spelling, grammar, punctuation and clarity, with a list of what changed.",
    title: "Online Proofreader: Spelling, Grammar, Punctuation & Clarity Check",
    desc: "A single proofreading pass for spelling, grammar, punctuation and clear wording, with every edit listed. Polish essays and experts before you submit.",
    cat: "EducationalApplication",
    about: ["The Proofreader is the last check before you submit. It corrects spelling, grammar and punctuation and also tightens unclear or clumsy sentences, then lists each change it made.",
            "Use it on essays, reports, cover letters and emails when you want the text to read cleanly without being rewritten from scratch."],
    steps: ["Paste the finished text.", "Press Proofread.", "Read through the edits and keep the ones you agree with.", "Copy the final version."],
    faq: [["How is this different from the Grammar Checker?", "The Grammar Checker fixes grammar and punctuation only. The Proofreader also corrects spelling and improves clarity in a single pass."],
          ["Will it change my argument?", "No. It edits how things are said, not what you are saying."],
          ["Should I still read it myself?", "Yes. Automatic tools make mistakes, so always read the final text once before you submit."]]
  },
  "/tools/paraphraser": {
    name: "Paraphraser", h1: "Paraphraser", sub: "Rewrite any text in new words and your choice of style, keeping the meaning.",
    title: "Paraphrasing Tool: Rewrite Sentences in New Words, Keep the Meaning",
    desc: "Rewrite any paragraph in fresh wording and your choice of tone, such as formal, simple or academic, while keeping the original meaning.",
    cat: "EducationalApplication",
    about: ["The Paraphraser restates your text in different words and sentence structures while keeping the meaning. Pick a style, such as simple, formal or academic, to match where the text will be used.",
            "Paraphrasing is useful for summarising your own notes, simplifying dense passages and improving flow. When you use someone else's ideas, you still need to cite the source."],
    steps: ["Paste the sentence or paragraph.", "Choose the style you want.", "Press Paraphrase and compare the new version with the original.", "Copy the version you prefer."],
    faq: [["Does paraphrasing replace citing?", "No. A paraphrased idea still belongs to its source and must be cited. Our Citation Generator can find and format the references."],
          ["Can I choose the tone?", "Yes. Choose a style before you run it and run it again for a different version."],
          ["Is the meaning preserved?", "The tool aims to keep it, but read the output and check that nothing important was lost."]]
  },
  "/tools/flashcards": {
    name: "Flashcards", h1: "Flashcards", sub: "Paste notes or type a topic and get a deck of flip cards made for you.",
    title: "Flashcard Maker: Turn Notes or Any Topic into Study Flashcards",
    desc: "Paste your notes or type a topic and get a deck of flip-style study flashcards, with a question on the front and the answer on the back.",
    cat: "EducationalApplication",
    about: ["The Flashcard Maker turns your notes or a topic into a deck of question-and-answer cards. Click a card to flip it and check yourself.",
            "Active recall, testing yourself instead of re-reading, is one of the most effective ways to revise. Make a deck for each chapter and go through it a few times in the days before an exam."],
    steps: ["Paste your notes or type a topic such as photosynthesis.", "Choose how many cards you want.", "Press Make flashcards.", "Flip through the deck and repeat the ones you got wrong."],
    faq: [["How many cards can I make?", "You choose the number of cards before you generate the deck."],
          ["Can I use my own notes?", "Yes. Paste lecture notes or a textbook summary and the cards are built from that text."],
          ["Can I save the deck?", "You can copy the cards as text and keep them in your own notes app."]]
  }
};

const CITATION = {
  name: "Citation Generator", path: "/citation-generator",
  title: "Citation Generator: Find Real Sources & References for Your Document | Expert Help",
  desc: "Upload your DOCX, choose how many references you need and a citation style, and get real, verifiable sources with DOIs.",
  cat: "EducationalApplication",
  about: ["The Citation Generator reads your document, finds real, verifiable sources that match what you wrote, and formats them in the citation style you choose, with DOIs where they exist.",
          "Choose how many references you need (for example 5, 10, 15 or 20) and a style such as APA, MLA, Harvard, Chicago or IEEE."],
  steps: ["Upload your DOCX.", "Choose the number of references and the citation style.", "Press Generate and review the sources.", "Open each DOI to check the source, then copy the reference list."],
  faq: [["Are the sources real?", "The tool looks for published sources with identifiers such as DOIs. Always open the link and confirm the source says what you need it to say before you cite it."],
        ["Which styles are supported?", "The common academic styles. Pick one from the style list before you generate."],
        ["Is there a free try?", "Your first use is free. The $30/month plan covers every service."]]
};

const NAV = [["/", "Home"], ["/doc", "Doc Library"], ["/citation-generator", "Citation Generator"]]
  .concat(Object.keys(TOOLS).map((p) => [p, TOOLS[p].name]));

const nav = (cur) => `<nav aria-label="All services" style="max-width:940px;margin:18px auto;padding:0 18px;font-size:14px;line-height:2">${NAV.map(([h, n]) => (h === cur ? `<b>${esc(n)}</b>` : `<a href="${h}">${esc(n)}</a>`)).join(" · ")}</nav>`;

function content(t, name) {
  return `<section id="about-tool" style="max-width:940px;margin:0 auto;padding:6px 18px 40px;line-height:1.7;color:#1c2233">`
    + `<h2>About the ${esc(name)}</h2>${t.about.map((p) => `<p>${esc(p)}</p>`).join("")}`
    + `<h2>How to use the ${esc(name)}</h2><ol>${t.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`
    + `<h2>Frequently asked questions</h2>${t.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}`
    + `<h2>More study services</h2><p>${NAV.slice(1).map(([h, n]) => `<a href="${h}">${esc(n)}</a>`).join(" · ")}</p></section>`;
}

function headTags(o, path, t, name) {
  const url = o + path, site = process.env.SITE_NAME || "Expert Help", img = o + "/img/logo.webp";
  const ld = JSON.stringify([
    { "@context": "https://schema.org", "@type": "WebApplication", name, url, description: t.desc, applicationCategory: t.cat, operatingSystem: "Any", browserRequirements: "Requires JavaScript",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "First use free; $30/month plan for unlimited use" }, isPartOf: { "@type": "WebSite", name: site, url: o } },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: t.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: o + "/" }, { "@type": "ListItem", position: 2, name, item: url }] }
  ]).replace(/</g, "\\u003c");
  return `<meta name="description" content="${esc(t.desc)}"><meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1"><link rel="canonical" href="${esc(url)}">`
    + `<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(site)}"><meta property="og:title" content="${esc(t.title)}"><meta property="og:description" content="${esc(t.desc)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(img)}">`
    + `<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(t.title)}"><meta name="twitter:description" content="${esc(t.desc)}"><meta name="theme-color" content="#0f766e">`
    + `<script type="application/ld+json">${ld}</script>`;
}

/* tools.html -> a complete, crawlable page for one tool. tpl = the file text, o = site origin. */
function renderTool(tpl, o, path) {
  const t = TOOLS[path]; if (!t) return null;
  const tabs = [["/citation-generator", "Citation Generator"]].concat(Object.keys(TOOLS).map((p) => [p, TOOLS[p].name]))
    .map(([h, n]) => `<a href="${h}"${h === path ? ' class="on"' : ""}>${esc(n)}</a>`).join("");
  return tpl
    .replace("<title>Study Services | Expert Help</title>", () => `<title>${esc(t.title)} | Expert Help</title>` + headTags(o, path, t, t.name))
    .replace('<h1 id="h1"></h1>', () => `<h1 id="h1">${esc(t.h1)}</h1>`)
    .replace('<p class="sub" id="sub"></p>', () => `<p class="sub" id="sub">${esc(t.sub)}</p>`)
    .replace('<nav class="tabs" id="tabs" aria-label="Services"></nav>', () => `<nav class="tabs" id="tabs" aria-label="Services">${tabs}</nav>`)
    .replace('<div class="mo" id="mo"', () => content(t, t.name) + '<div class="mo" id="mo"');
}

/* citation-generator.html: add canonical + structured data + readable text (it already has its own title, description and h1). */
function renderCitation(tpl, o) {
  const head = headTags(o, CITATION.path, CITATION, CITATION.name).replace(/<meta name="description"[^>]*>/, "");
  let out = tpl.replace("</head>", () => head + "</head>");
  const block = nav(CITATION.path) + content(CITATION, CITATION.name);
  return /<\/body>/i.test(out) ? out.replace(/<\/body>/i, () => block + "</body>") : out + block;
}

module.exports = { TOOLS, renderTool, renderCitation, CITATION };
