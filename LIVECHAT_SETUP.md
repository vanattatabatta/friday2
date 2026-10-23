# Human live chat: how replies and transcripts work

## Where the support executive replies
1. Create an agent login once (same accounts as the admin panel): `cd backend && npm run create-admin`
2. Open **https://YOUR-SITE/agent** (also linked as "Live chat" at the top of the admin panel) and sign in.
3. New visitors appear on the left instantly with a sound alert. Click one, read it and type a reply
   (Enter sends, Shift+Enter = new line). The visitor sees the reply in their chat window straight away.
4. Click **End chat & email transcript** when finished. Visitors can also end the chat themselves,
   and chats are closed automatically after 30 minutes of silence.

## Where transcripts go
Open **/agent > Settings**:
- **Forward transcripts to**: one or more emails (comma separated). Every finished chat is sent there.
- **Email a copy to the visitor**: only if the visitor typed an email (the chat box no longer asks for one).
- **Email when a new chat starts**: sends the first message + a link to /agent so nobody misses a chat.

Until you save these settings, `LIVECHAT_EMAIL_TO` (or `EMAIL_TO`) in `backend/.env` is used.
Email sending needs the mail settings (own mail relay / Resend / SMTP) already described in `.env.example`.

## Only one chat open at a time
Opening the live chat collapses the AI assistant box, and using the assistant box minimises the live chat.

## WhatsApp icon (set the number in the console)
Open **/agent > Settings** and fill in **WhatsApp number** (country code first, digits only, e.g. `14155550100`)
and, optionally, the pre-filled message. Save - the green WhatsApp icon on the website uses it straight away
(it now sits at the bottom-LEFT of the page; the red live-chat launcher button is hidden; visitors tap it, WhatsApp opens a chat with that number, and you reply from your own WhatsApp).
Leave the number empty to hide the icon. `WHATSAPP_NUMBER` in `backend/.env` is only a fallback until you save one.

## Live visitors tab (/agent > "Live visitors")
Shows everyone on the website right now: country + flag, IP address, current page, device, time on site and
whether they are only browsing or chatting. Visitors who open the live chat also show the name, email and last
message they typed, with an **Open chat** button. It updates live; a visitor drops off ~50 seconds after closing the site.
- Pages send an anonymous heartbeat (`js/presence.js`). Search-engine bots and monitors are ignored.
- The list is kept in memory only (nothing stored), so a server restart simply starts it again.
- Country comes from the IP (CDN header if present, else ipapi.co, then ipwho.is as a fallback).
- Showing visitor IPs is personal data in many countries: mention it in your privacy policy.

## AI Detector (navbar box)
The "AI Detector" box in the navbar opens a panel where a visitor pastes text (min 80 words) and gets the % AI-written
vs % human-written plus sentence highlighting. Endpoint: `POST /api/aicheck` (12 checks / 10 min per IP).
It is a statistical estimate (wording, sentence-length variety, stock AI phrases, human markers). If `GROQ_API_KEY`
is set, a language model also scores each sentence and the two are averaged ("deep scan"). Like every AI detector
it can be wrong, so the panel shows a disclaimer.

### Humanize with AI (inside the AI Detector)
`POST /api/aicheck/humanize` rewrites the text in a natural human voice (tone: academic / professional / casual) using
`GROQ_API_KEY`, then re-scores it so the visitor sees the before/after. Limits: 40 to ~2,000 words per request,
6 rewrites / 10 min per IP. Set `HUMANIZE_MODEL` in `backend/.env` to try a different Groq model (falls back to the default if the model is unavailable). It cannot promise any detector's verdict; the panel tells users to read the result through.

## After editing any file in /css or /js
`server.js` serves the `.gz` / `.br` copy when one exists, so regenerate it or visitors keep getting the old file
(and bump the `?v=` number in `index.html`, because css/js are cached for a year).

## Support agents (10 display profiles)
The chat window shows an agent with an illustrated avatar and a US-style name (header + their replies). Each visitor
gets one of 10 profiles, kept across pages and for the whole chat. The names live in `backend/services/personas.js`
(order must match `PERSONAS` in `js/livechat.js` and `PERS` in `agent.html`); the avatars are drawn in `js/livechat.js`.
The agent console shows "Visitor sees you as ..." for the open chat, and transcripts list the real login in brackets.
Needs no database step: two new columns (`persona`, `agent_user`) are added automatically at server start.

## Instant sending
Quick-reply chips and typed messages appear in the chat immediately; the server call runs in the background. If it
fails the bubble turns red with "Not sent. Tap to retry".

## Chat window size + WhatsApp position
- The WhatsApp icon sits at the bottom-LEFT. The red chat icon sits bottom-RIGHT and is visible whenever the chat window is closed or minimised; it disappears while the window is open.
- On screens wider than 480px the chat window is shown at 110% size (`zoom:1.1` rule in `js/livechat.js`; change that number to resize). Phones keep the full-width layout.
- The back-to-top button is moved up so it does not sit under the chat icon.

## Canned responses (agent console)
In **/agent**, a "Canned:" bar sits above the reply box. One click inserts the text into the reply box instantly (at the cursor;
nothing is sent until you press Send). **+ Add** saves your own (kept in that browser, remove with the x). Edit the defaults in the
`CANNED` array in `agent.html`.

## Real photos for the support agents
See `img/agents/README.txt` (add the JPGs, then set `agentPhotos:true` in `window.AH_LIVECHAT` in `index.html`).

