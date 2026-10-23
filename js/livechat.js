/* Human live chat widget (v2: 9 languages picked manually - default English, RTL, refreshed UI). Every reply comes from a real person (agent console: /agent.html). No AI.
 *
 * Optional config, set before this script loads:
 *   window.AH_LIVECHAT = { whatsapp: "14155550100", text: "Hi, I need expert help",
 *                          brand: "Expert Help", autoOpenDelay: 15000,      // ms, -1 = never auto-open
 *                          chips: ["Get a free quote", "Essay help", "Coding help", "Online class help"] };
 */
(function () {
  "use strict";
  var CFG = window.AH_LIVECHAT || {};
  var API = "/api/livechat", KEY = "ah_livechat", DISMISS = "ah_livechat_min";
  var WA = String(CFG.whatsapp || "").replace(/\D/g, "");
  var BRAND = CFG.brand || "Expert Help";
  var DELAY = CFG.autoOpenDelay == null ? 15000 : CFG.autoOpenDelay;
  var CHIPS = CFG.chips || ["Get a free quote", "Essay help", "Coding help", "Online class help"];
  var S = null, es = null, open = false, unread = 0, startP = null, pending = [], tmpN = 0;
  try { S = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) {}

  /* ------------------------------------------------ languages (UI text, flag, direction) ------------------------------------------------ */
  var LANGS = {
    en: { n: "English", f: "us", t: { retry: "Not sent. Tap to retry", sub: "Online \u00B7 replies in a few minutes", "with": "{a} is with you", tease: "\uD83D\uDC4B Need help? Chat with an expert", hello: "Hi there! \uD83D\uDC4B Need a hand with an expert, essay, coding task or online class?\nTell us what you need and an expert will reply right here.", ph: "Type your message\u2026", chips: ["Get a free quote", "Essay help", "Coding help", "Online class help"], wa: "Chat on WhatsApp", sent: " Sent \u2713 An expert will reply shortly", ended: "This chat has ended. ", again: "Start a new chat", endq: "End this chat? Your conversation will be closed.", open: "Open live chat", min: "Minimise chat", end: "End chat", lang: "Language", det: "Language set from your location", chg: "Change" } },
    fr: { n: "Fran\u00E7ais", f: "fr", t: { retry: "Non envoy\u00E9. Appuyez pour r\u00E9essayer", sub: "En ligne \u00B7 r\u00E9ponse en quelques minutes", "with": "{a} est avec vous", tease: "\uD83D\uDC4B Besoin d'aide ? Discutez avec un expert", hello: "Bonjour ! \uD83D\uDC4B Besoin d'aide pour un devoir, une dissertation, du code ou un cours en ligne ?\nDites-nous ce qu'il vous faut et un expert vous r\u00E9pond ici.", ph: "\u00C9crivez votre message\u2026", chips: ["Devis gratuit", "Aide pour dissertation", "Aide en programmation", "Aide cours en ligne"], wa: "Discuter sur WhatsApp", sent: " Envoy\u00E9 \u2713 Un expert r\u00E9pond bient\u00F4t", ended: "Ce chat est termin\u00E9. ", again: "Nouveau chat", endq: "Terminer ce chat ? La conversation sera ferm\u00E9e.", open: "Ouvrir le chat", min: "R\u00E9duire le chat", end: "Terminer le chat", lang: "Langue", det: "Langue choisie d'apr\u00E8s votre position", chg: "Changer" } },
    hi: { n: "\u0939\u093F\u0928\u094D\u0926\u0940", f: "in", t: { retry: "\u092D\u0947\u091C\u093E \u0928\u0939\u0940\u0902 \u0917\u092F\u093E\u0964 \u092B\u093F\u0930 \u0938\u0947 \u0915\u094B\u0936\u093F\u0936 \u0915\u0930\u0947\u0902", sub: "\u0911\u0928\u0932\u093E\u0907\u0928 \u00B7 \u0915\u0941\u091B \u0939\u0940 \u092E\u093F\u0928\u091F\u094B\u0902 \u092E\u0947\u0902 \u091C\u0935\u093E\u092C", "with": "{a} \u0906\u092A\u0915\u0947 \u0938\u093E\u0925 \u0939\u0948\u0902", tease: "\uD83D\uDC4B \u092E\u0926\u0926 \u091A\u093E\u0939\u093F\u090F? \u0915\u093F\u0938\u0940 \u0935\u093F\u0936\u0947\u0937\u091C\u094D\u091E \u0938\u0947 \u091A\u0948\u091F \u0915\u0930\u0947\u0902", hello: "\u0928\u092E\u0938\u094D\u0924\u0947! \uD83D\uDC4B \u0905\u0938\u093E\u0907\u0928\u092E\u0947\u0902\u091F, \u0928\u093F\u092C\u0902\u0927, \u0915\u094B\u0921\u093F\u0902\u0917 \u092F\u093E \u0911\u0928\u0932\u093E\u0907\u0928 \u0915\u094D\u0932\u093E\u0938 \u092E\u0947\u0902 \u092E\u0926\u0926 \u091A\u093E\u0939\u093F\u090F?\n\u092C\u0924\u093E\u0907\u090F \u0906\u092A\u0915\u094B \u0915\u094D\u092F\u093E \u091A\u093E\u0939\u093F\u090F, \u090F\u0915 \u0935\u093F\u0936\u0947\u0937\u091C\u094D\u091E \u092F\u0939\u0940\u0902 \u091C\u0935\u093E\u092C \u0926\u0947\u0917\u093E\u0964", ph: "\u0905\u092A\u0928\u093E \u0938\u0902\u0926\u0947\u0936 \u0932\u093F\u0916\u0947\u0902\u2026", chips: ["\u092E\u0941\u092B\u093C\u094D\u0924 \u0915\u094B\u091F\u0947\u0936\u0928 \u092A\u093E\u090F\u0902", "\u0928\u093F\u092C\u0902\u0927 \u092E\u0947\u0902 \u092E\u0926\u0926", "\u0915\u094B\u0921\u093F\u0902\u0917 \u092E\u0947\u0902 \u092E\u0926\u0926", "\u0911\u0928\u0932\u093E\u0907\u0928 \u0915\u094D\u0932\u093E\u0938 \u092E\u0947\u0902 \u092E\u0926\u0926"], wa: "WhatsApp \u092A\u0930 \u091A\u0948\u091F \u0915\u0930\u0947\u0902", sent: " \u092D\u0947\u091C\u093E \u0917\u092F\u093E \u2713 \u0935\u093F\u0936\u0947\u0937\u091C\u094D\u091E \u091C\u0932\u094D\u0926 \u091C\u0935\u093E\u092C \u0926\u0947\u0902\u0917\u0947", ended: "\u092F\u0939 \u091A\u0948\u091F \u0938\u092E\u093E\u092A\u094D\u0924 \u0939\u094B \u0917\u0908 \u0939\u0948\u0964 ", again: "\u0928\u0908 \u091A\u0948\u091F \u0936\u0941\u0930\u0942 \u0915\u0930\u0947\u0902", endq: "\u092F\u0939 \u091A\u0948\u091F \u0938\u092E\u093E\u092A\u094D\u0924 \u0915\u0930\u0947\u0902? \u092C\u093E\u0924\u091A\u0940\u0924 \u092C\u0902\u0926 \u0939\u094B \u091C\u093E\u090F\u0917\u0940\u0964", open: "\u0932\u093E\u0907\u0935 \u091A\u0948\u091F \u0916\u094B\u0932\u0947\u0902", min: "\u091A\u0948\u091F \u091B\u094B\u091F\u093E \u0915\u0930\u0947\u0902", end: "\u091A\u0948\u091F \u0938\u092E\u093E\u092A\u094D\u0924 \u0915\u0930\u0947\u0902", lang: "\u092D\u093E\u0937\u093E", det: "\u0906\u092A\u0915\u0940 \u0932\u094B\u0915\u0947\u0936\u0928 \u0915\u0947 \u0906\u0927\u093E\u0930 \u092A\u0930 \u092D\u093E\u0937\u093E \u091A\u0941\u0928\u0940 \u0917\u0908", chg: "\u092C\u0926\u0932\u0947\u0902" } },
    de: { n: "Deutsch", f: "de", t: { retry: "Nicht gesendet. Zum Wiederholen tippen", sub: "Online \u00B7 Antwort in wenigen Minuten", "with": "{a} ist bei Ihnen", tease: "\uD83D\uDC4B Brauchen Sie Hilfe? Chatten Sie mit einem Experten", hello: "Hallo! \uD83D\uDC4B Brauchen Sie Hilfe bei einer Hausarbeit, einem Aufsatz, einer Programmieraufgabe oder einem Online-Kurs?\nSagen Sie uns, was Sie brauchen \u2013 ein Experte antwortet hier.", ph: "Nachricht eingeben\u2026", chips: ["Kostenloses Angebot", "Hilfe beim Aufsatz", "Hilfe beim Programmieren", "Hilfe im Online-Kurs"], wa: "Per WhatsApp chatten", sent: " Gesendet \u2713 Ein Experte antwortet in K\u00FCrze", ended: "Dieser Chat wurde beendet. ", again: "Neuen Chat starten", endq: "Chat beenden? Die Unterhaltung wird geschlossen.", open: "Live-Chat \u00F6ffnen", min: "Chat minimieren", end: "Chat beenden", lang: "Sprache", det: "Sprache anhand Ihres Standorts gew\u00E4hlt", chg: "\u00C4ndern" } },
    zh: { n: "\u4E2D\u6587", f: "cn", t: { retry: "\u672A\u53D1\u9001\u3002\u70B9\u51FB\u91CD\u8BD5", sub: "\u5728\u7EBF \u00B7 \u51E0\u5206\u949F\u5185\u56DE\u590D", "with": "{a} \u6B63\u5728\u4E3A\u60A8\u670D\u52A1", tease: "\uD83D\uDC4B \u9700\u8981\u5E2E\u52A9\uFF1F\u4E0E\u4E13\u5BB6\u804A\u804A", hello: "\u60A8\u597D\uFF01\uD83D\uDC4B \u9700\u8981\u4F5C\u4E1A\u3001\u8BBA\u6587\u3001\u7F16\u7A0B\u6216\u7F51\u8BFE\u65B9\u9762\u7684\u5E2E\u52A9\u5417\uFF1F\n\u544A\u8BC9\u6211\u4EEC\u60A8\u7684\u9700\u6C42\uFF0C\u4E13\u5BB6\u4F1A\u5728\u8FD9\u91CC\u56DE\u590D\u60A8\u3002", ph: "\u8F93\u5165\u60A8\u7684\u6D88\u606F\u2026", chips: ["\u83B7\u53D6\u514D\u8D39\u62A5\u4EF7", "\u8BBA\u6587\u5E2E\u52A9", "\u7F16\u7A0B\u5E2E\u52A9", "\u7F51\u8BFE\u5E2E\u52A9"], wa: "\u5728 WhatsApp \u4E0A\u804A\u5929", sent: " \u5DF2\u53D1\u9001 \u2713 \u4E13\u5BB6\u5C06\u5F88\u5FEB\u56DE\u590D", ended: "\u672C\u6B21\u804A\u5929\u5DF2\u7ED3\u675F\u3002", again: "\u5F00\u59CB\u65B0\u804A\u5929", endq: "\u7ED3\u675F\u6B64\u804A\u5929\uFF1F\u5BF9\u8BDD\u5C06\u88AB\u5173\u95ED\u3002", open: "\u6253\u5F00\u5728\u7EBF\u804A\u5929", min: "\u6700\u5C0F\u5316\u804A\u5929", end: "\u7ED3\u675F\u804A\u5929", lang: "\u8BED\u8A00", det: "\u5DF2\u6839\u636E\u60A8\u7684\u4F4D\u7F6E\u9009\u62E9\u8BED\u8A00", chg: "\u66F4\u6539" } },
    ar: { n: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", f: "ae", rtl: 1, t: { retry: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u0627\u0636\u063A\u0637 \u0644\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649", sub: "\u0645\u062A\u0635\u0644 \u00B7 \u0646\u0631\u062F \u062E\u0644\u0627\u0644 \u062F\u0642\u0627\u0626\u0642", "with": "{a} \u0645\u0639\u0643 \u0627\u0644\u0622\u0646", tease: "\uD83D\uDC4B \u062A\u062D\u062A\u0627\u062C \u0645\u0633\u0627\u0639\u062F\u0629\u061F \u062A\u062D\u062F\u062B \u0645\u0639 \u062E\u0628\u064A\u0631", hello: "\u0645\u0631\u062D\u0628\u064B\u0627! \uD83D\uDC4B \u0647\u0644 \u062A\u062D\u062A\u0627\u062C \u0645\u0633\u0627\u0639\u062F\u0629 \u0641\u064A \u0648\u0627\u062C\u0628 \u0623\u0648 \u0645\u0642\u0627\u0644 \u0623\u0648 \u0628\u0631\u0645\u062C\u0629 \u0623\u0648 \u062F\u0648\u0631\u0629 \u0639\u0628\u0631 \u0627\u0644\u0625\u0646\u062A\u0631\u0646\u062A\u061F\n\u0623\u062E\u0628\u0631\u0646\u0627 \u0628\u0645\u0627 \u062A\u062D\u062A\u0627\u062C\u0647 \u0648\u0633\u064A\u0631\u062F \u0639\u0644\u064A\u0643 \u062E\u0628\u064A\u0631 \u0647\u0646\u0627.", ph: "\u0627\u0643\u062A\u0628 \u0631\u0633\u0627\u0644\u062A\u0643\u2026", chips: ["\u0627\u062D\u0635\u0644 \u0639\u0644\u0649 \u0639\u0631\u0636 \u0633\u0639\u0631 \u0645\u062C\u0627\u0646\u064A", "\u0645\u0633\u0627\u0639\u062F\u0629 \u0641\u064A \u0627\u0644\u0645\u0642\u0627\u0644\u0627\u062A", "\u0645\u0633\u0627\u0639\u062F\u0629 \u0641\u064A \u0627\u0644\u0628\u0631\u0645\u062C\u0629", "\u0645\u0633\u0627\u0639\u062F\u0629 \u0641\u064A \u0627\u0644\u062F\u0648\u0631\u0627\u062A"], wa: "\u0627\u0644\u062F\u0631\u062F\u0634\u0629 \u0639\u0628\u0631 \u0648\u0627\u062A\u0633\u0627\u0628", sent: " \u062A\u0645 \u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u2713 \u0633\u064A\u0631\u062F \u0639\u0644\u064A\u0643 \u062E\u0628\u064A\u0631 \u0642\u0631\u064A\u0628\u064B\u0627", ended: "\u0627\u0646\u062A\u0647\u062A \u0647\u0630\u0647 \u0627\u0644\u062F\u0631\u062F\u0634\u0629. ", again: "\u0627\u0628\u062F\u0623 \u062F\u0631\u062F\u0634\u0629 \u062C\u062F\u064A\u062F\u0629", endq: "\u0625\u0646\u0647\u0627\u0621 \u0647\u0630\u0647 \u0627\u0644\u062F\u0631\u062F\u0634\u0629\u061F \u0633\u064A\u062A\u0645 \u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629.", open: "\u0641\u062A\u062D \u0627\u0644\u062F\u0631\u062F\u0634\u0629 \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629", min: "\u062A\u0635\u063A\u064A\u0631 \u0627\u0644\u062F\u0631\u062F\u0634\u0629", end: "\u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u062F\u0631\u062F\u0634\u0629", lang: "\u0627\u0644\u0644\u063A\u0629", det: "\u062A\u0645 \u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0644\u0644\u063A\u0629 \u062D\u0633\u0628 \u0645\u0648\u0642\u0639\u0643", chg: "\u062A\u063A\u064A\u064A\u0631" } },
    es: { n: "Espa\u00F1ol", f: "es", t: { retry: "No enviado. Toca para reintentar", sub: "En l\u00EDnea \u00B7 respondemos en pocos minutos", "with": "{a} est\u00E1 contigo", tease: "\uD83D\uDC4B \u00BFNecesitas ayuda? Chatea con un experto", hello: "\u00A1Hola! \uD83D\uDC4B \u00BFNecesitas ayuda con una tarea, un ensayo, programaci\u00F3n o una clase en l\u00EDnea?\nCu\u00E9ntanos qu\u00E9 necesitas y un experto te responder\u00E1 aqu\u00ED.", ph: "Escribe tu mensaje\u2026", chips: ["Presupuesto gratis", "Ayuda con ensayos", "Ayuda con programaci\u00F3n", "Ayuda con clases en l\u00EDnea"], wa: "Chatear por WhatsApp", sent: " Enviado \u2713 Un experto responder\u00E1 pronto", ended: "Este chat ha terminado. ", again: "Iniciar un chat nuevo", endq: "\u00BFTerminar este chat? La conversaci\u00F3n se cerrar\u00E1.", open: "Abrir chat en vivo", min: "Minimizar chat", end: "Terminar chat", lang: "Idioma", det: "Idioma elegido seg\u00FAn tu ubicaci\u00F3n", chg: "Cambiar" } },
    it: { retry: "Non inviato. Tocca per riprovare", n: "Italiano", f: "it", t: { sub: "Online \u00B7 risposta in pochi minuti", "with": "{a} \u00E8 con te", tease: "\uD83D\uDC4B Serve aiuto? Chatta con un esperto", hello: "Ciao! \uD83D\uDC4B Hai bisogno di aiuto con un compito, un saggio, programmazione o un corso online?\nDicci di cosa hai bisogno e un esperto ti risponder\u00E0 qui.", ph: "Scrivi il tuo messaggio\u2026", chips: ["Preventivo gratuito", "Aiuto con i saggi", "Aiuto con la programmazione", "Aiuto con i corsi online"], wa: "Chatta su WhatsApp", sent: " Inviato \u2713 Un esperto risponder\u00E0 a breve", ended: "Questa chat \u00E8 terminata. ", again: "Avvia una nuova chat", endq: "Terminare questa chat? La conversazione verr\u00E0 chiusa.", open: "Apri la chat dal vivo", min: "Riduci la chat", end: "Termina chat", lang: "Lingua", det: "Lingua scelta in base alla tua posizione", chg: "Cambia" } },
    vi: { n: "Ti\u1EBFng Vi\u1EC7t", f: "vn", t: { retry: "Ch\u01B0a g\u1EEDi. Ch\u1EA1m \u0111\u1EC3 th\u1EED l\u1EA1i", sub: "Tr\u1EF1c tuy\u1EBFn \u00B7 ph\u1EA3n h\u1ED3i trong v\u00E0i ph\u00FAt", "with": "{a} \u0111ang h\u1ED7 tr\u1EE3 b\u1EA1n", tease: "\uD83D\uDC4B C\u1EA7n tr\u1EE3 gi\u00FAp? Tr\u00F2 chuy\u1EC7n v\u1EDBi chuy\u00EAn gia", hello: "Xin ch\u00E0o! \uD83D\uDC4B B\u1EA1n c\u1EA7n h\u1ED7 tr\u1EE3 b\u00E0i t\u1EADp, b\u00E0i lu\u1EADn, l\u1EADp tr\u00ECnh hay l\u1EDBp h\u1ECDc tr\u1EF1c tuy\u1EBFn?\nH\u00E3y cho ch\u00FAng t\u00F4i bi\u1EBFt, chuy\u00EAn gia s\u1EBD tr\u1EA3 l\u1EDDi ngay t\u1EA1i \u0111\u00E2y.", ph: "Nh\u1EADp tin nh\u1EAFn\u2026", chips: ["Nh\u1EADn b\u00E1o gi\u00E1 mi\u1EC5n ph\u00ED", "H\u1ED7 tr\u1EE3 vi\u1EBFt lu\u1EADn", "H\u1ED7 tr\u1EE3 l\u1EADp tr\u00ECnh", "H\u1ED7 tr\u1EE3 l\u1EDBp h\u1ECDc tr\u1EF1c tuy\u1EBFn"], wa: "Chat qua WhatsApp", sent: " \u0110\u00E3 g\u1EEDi \u2713 Chuy\u00EAn gia s\u1EBD tr\u1EA3 l\u1EDDi s\u1EDBm", ended: "Cu\u1ED9c tr\u00F2 chuy\u1EC7n \u0111\u00E3 k\u1EBFt th\u00FAc. ", again: "B\u1EAFt \u0111\u1EA7u chat m\u1EDBi", endq: "K\u1EBFt th\u00FAc cu\u1ED9c tr\u00F2 chuy\u1EC7n? Cu\u1ED9c tr\u00F2 chuy\u1EC7n s\u1EBD b\u1ECB \u0111\u00F3ng.", open: "M\u1EDF chat tr\u1EF1c ti\u1EBFp", min: "Thu nh\u1ECF chat", end: "K\u1EBFt th\u00FAc chat", lang: "Ng\u00F4n ng\u1EEF", det: "Ng\u00F4n ng\u1EEF \u0111\u01B0\u1EE3c ch\u1ECDn theo v\u1ECB tr\u00ED c\u1EE7a b\u1EA1n", chg: "\u0110\u1ED5i" } }
  };
  var ORDER = ["en", "fr", "hi", "de", "zh", "ar", "es", "it", "vi"];
  var LKEY = "ah_lc_lang", lang = "en", noteOn = false, saved = null;
  try { saved = localStorage.getItem(LKEY); } catch (e) {}
  function T(k, v) { var s = LANGS[lang].t[k]; if (s == null) s = LANGS.en.t[k]; return v ? s.replace("{a}", v) : s; }
  function flagUrl(c) { return (window.AHFlags && window.AHFlags.uri(c)) || "https://flagcdn.com/w40/" + c + ".png"; }
  lang = LANGS[saved] ? saved : "en";   // manual choice only (no browser / IP region detection)


  /* helpers needed by the block below */
  function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }

  /* ------------------------------------------------ support agents (10 display profiles + real photos) ------------------------------------------------
   * ORDER must match NAMES in backend/services/personas.js. The visitor keeps the same agent across pages (localStorage);
   * the chat session remembers it on the server so the same name + face answer the whole conversation. */
var PERSONAS = [
  { n: "Emily Carter" },
  { n: "Michael Brooks" },
  { n: "Jessica Miller" },
  { n: "Daniel Harris" },
  { n: "Ashley Johnson" },
  { n: "Brandon Walker" },
  { n: "Olivia Bennett" },
  { n: "Jason Mitchell" },
  { n: "Megan Collins" },
  { n: "Ryan Thompson" }
];


  function personaIdx(name) { for (var i = 0; i < PERSONAS.length; i++) if (PERSONAS[i].n === name) return i; return -1; }
  var PKEY = "ah_lc_persona", PI = -1;
  if (S && typeof S.persona === "number" && PERSONAS[S.persona]) PI = S.persona;
  if (PI < 0) { try { var sp = parseInt(localStorage.getItem(PKEY), 10); if (sp >= 0 && sp < PERSONAS.length) PI = sp; } catch (e) {} }
  if (PI < 0) PI = Math.floor(Math.random() * PERSONAS.length);
  try { localStorage.setItem(PKEY, String(PI)); } catch (e) {}
  function agentIdx(name) { var i = personaIdx(name); return i >= 0 ? i : (S && typeof S.persona === "number" && PERSONAS[S.persona] ? S.persona : PI); }
  /* Agent photos: img/agents/<first>-<last>.jpg (e.g. emily-carter.jpg), always used. If a file is missing the avatar shows the
     agent's initials in a coloured circle (plain text, no drawn portrait) until the photo is added. */
  function photoUrl(i) { return "img/agents/" + PERSONAS[i].n.toLowerCase().replace(/\s+/g, "-") + ".jpg"; }
  function initials(i) { return PERSONAS[i].n.split(" ").map(function (w) { return w.charAt(0); }).join(""); }
  function setAv(im, i) {
    im.onerror = function () {
      im.onerror = null;
      var sp = el("span", im.className || "lc-av", initials(i)); sp.classList.add("lc-ini");
      if (im.parentNode) im.parentNode.replaceChild(sp, im);
    };
    im.src = photoUrl(i);
  }
  /* photos are requested only when window.AH_LIVECHAT.agentPhotos === true (a missing JPG is a 404 that Lighthouse reports as a console error) */
  function avImg(i, cls) {
    if (CFG.agentPhotos !== true) { var sp = el("span", cls || "lc-av", initials(i)); sp.classList.add("lc-ini"); return sp; }
    var im = el("img", cls || "lc-av"); im.alt = ""; im.width = 26; im.height = 26; im.decoding = "async"; setAv(im, i); return im; }

  /* ------------------------------------------------ styles ------------------------------------------------ */
  var css = [
    "#lc-dock,#lc-box{--lc1:#9f1239;--lc2:#e11d48;--lc3:#f97316;--lc-g:linear-gradient(135deg,#9f1239 0%,#e11d48 62%,#f97316 100%)}",
    "#lc-dock{position:fixed;left:20px;bottom:20px;z-index:99990;display:flex;flex-direction:column;align-items:center;gap:14px;font-family:Poppins,Arial,sans-serif}",
    "#lc-wa,#lc-btn{position:relative;display:flex;align-items:center;justify-content:center;width:48px;height:48px;border:0;border-radius:50%;cursor:pointer;text-decoration:none;transition:transform .2s,box-shadow .2s;-webkit-tap-highlight-color:transparent}",
    "#lc-wa:hover,#lc-btn:hover{transform:translateY(-3px) scale(1.06)}",
    "#lc-btn{position:fixed;right:20px;bottom:20px;z-index:99990}#lc-dock.open #lc-btn{display:none}",
    "#lc-wa{background:#25d366;box-shadow:0 10px 24px rgba(37,211,102,.45)}",
    "#lc-btn{background:var(--lc-g);box-shadow:0 10px 24px rgba(225,29,72,.5)}",
    "#lc-btn::before{content:\"\";position:absolute;inset:0;border-radius:50%;border:2px solid #e11d48;animation:lcring 2.4s ease-out infinite;pointer-events:none}",
    "#lc-dock.open #lc-btn::before,#lc-dock.seen #lc-btn::before{animation:none;opacity:0}",
    "@keyframes lcring{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.7);opacity:0}}",
    "#lc-wa svg{width:26px;height:26px;fill:#fff}#lc-btn svg{width:26px;height:26px}",
    "#lc-wa{min-width:48px;width:auto;padding:0;overflow:hidden;white-space:nowrap;transition:padding .35s cubic-bezier(.4,0,.2,1),transform .2s,box-shadow .2s}",
    "#lc-wa svg{flex:none}",
    "#lc-wa .lc-wt{display:block;max-width:0;margin-left:0;opacity:0;overflow:hidden;color:#fff;font:600 15px/1 Poppins,Arial,sans-serif;letter-spacing:.1px;transition:max-width .4s cubic-bezier(.4,0,.2,1),margin-left .4s cubic-bezier(.4,0,.2,1),opacity .3s}",
    "#lc-wa.x{border-radius:30px;padding:0 20px 0 14px}",
    "#lc-wa.x .lc-wt{max-width:190px;margin-left:10px;opacity:1}",
    "@media(prefers-reduced-motion:reduce){#lc-wa,#lc-wa .lc-wt{transition:none}}",
    "#lc-btn .ic-x{display:none}#lc-dock.open #lc-btn .ic-hs{display:none}#lc-dock.open #lc-btn .ic-x{display:block}",
    "#lc-btn .dot{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#ef4444;color:#fff;font:700 11px/20px Arial;text-align:center;border:2px solid #fff;box-sizing:content-box;animation:lcpop .3s}",
    "@keyframes lcpop{from{transform:scale(0)}to{transform:scale(1)}}",
    "#lc-tease{position:absolute;left:68px;bottom:6px;display:none;align-items:center;gap:8px;background:#fff;color:#1f2937;font:500 13px Poppins,Arial,sans-serif;padding:10px 12px 10px 14px;border-radius:14px 14px 14px 4px;box-shadow:0 10px 30px rgba(0,0,0,.18);white-space:nowrap;cursor:pointer;animation:lcin .3s ease-out}",
    "#lc-tease.on{display:flex}#lc-tease button{border:0;background:none;color:#94a3b8;font-size:16px;line-height:1;cursor:pointer;padding:0 2px}",
    "#lc-box{position:fixed;right:20px;bottom:20px;z-index:99991;display:none;flex-direction:column;width:min(376px,calc(100vw - 24px));height:min(580px,calc(100vh - 40px));min-height:300px;background:#fff7f5;border-radius:20px;box-shadow:0 20px 60px rgba(30,20,10,.3);overflow:hidden;font:14px/1.5 Poppins,Arial,sans-serif;color:#1f2937;transform-origin:bottom right}",
    "#lc-box .lc-bt small.lc-ag{display:flex;align-items:center;gap:8px;margin-top:2px;opacity:1}.lc-ag img{flex:none;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.55)}.lc-ag span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}",
    ".lc-ini{letter-spacing:.3px}.lc-ag .lc-ini{width:20px;height:20px;font-size:9px;border-radius:50%;box-shadow:0 0 0 2px rgba(255,255,255,.55)}img.lc-av{background:#fff;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.06)}.lc-r.fail .lc-m{background:#fee2e2;color:#991b1b}.lc-retry{display:block;margin-top:4px;border:0;background:none;padding:0;color:#b91c1c;font:600 11.5px Poppins,Arial,sans-serif;text-decoration:underline;cursor:pointer}",
    "#lc-box.on{display:flex;animation:lcin .25s cubic-bezier(.2,.9,.3,1.1)}@keyframes lcin{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}",
    "#lc-box *{box-sizing:border-box;font-family:inherit}",
    ".lc-h{display:flex;align-items:center;gap:10px;padding:14px 12px 14px 14px;background:var(--lc-g);color:#fff;flex:none}",
    ".lc-logo{position:relative;flex:none;width:46px;height:46px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;color:#be123c;box-shadow:0 0 0 3px rgba(255,255,255,.35),0 4px 10px rgba(0,0,0,.18)}.lc-logo img{width:32px;height:auto;display:block}",
    ".lc-logo::after{content:\"\";position:absolute;right:0;bottom:0;width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid #fff}",
    ".lc-bt{flex:1;min-width:0;line-height:1.25}.lc-bt b{display:block;font-size:15.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lc-bt small{display:block;font-size:11.5px;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".lc-hb{flex:none;width:30px;height:30px;border:0;background:rgba(255,255,255,.2);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background .15s}.lc-hb:hover{background:rgba(255,255,255,.35)}.lc-hb svg{width:16px;height:16px;stroke:#fff;stroke-width:2.6;stroke-linecap:round;fill:none}",
    ".lc-log{flex:1;overflow-y:auto;padding:14px 12px 8px;display:flex;flex-direction:column;gap:9px;scroll-behavior:smooth}",
    ".lc-r{display:flex;align-items:flex-end;gap:8px;animation:lcmsg .25s ease-out}.lc-r.v{justify-content:flex-end}@keyframes lcmsg{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}",
    ".lc-av{flex:none;width:26px;height:26px;border-radius:50%;background:var(--lc-g);color:#fff;font-weight:600;font-size:12px;display:flex;align-items:center;justify-content:center}",
    ".lc-m{max-width:80%;padding:9px 13px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13.5px;line-height:1.45}",
    ".lc-r.a .lc-m{background:#ffe6ea;color:#3b1220;border:1px solid #fbc9d3;border-radius:16px 16px 16px 4px;box-shadow:0 1px 3px rgba(159,18,57,.10)}",
    ".lc-r.v .lc-m{background:var(--lc-g);color:#fff;border-radius:16px 16px 4px 16px}",
    ".lc-r.v.fail .lc-m{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}.lc-r.v.fail .lc-m small{opacity:.8}.lc-m a{color:#be123c;text-decoration:none}.lc-m a:hover{text-decoration:underline}.lc-r.v .lc-m a{color:#fff;text-decoration:underline}",
    ".lc-m small{display:block;font-size:10px;opacity:.6;margin-top:3px}.lc-r.v .lc-m small{text-align:right}",
    ".lc-sys,.lc-hint{align-self:center;color:#64748b;font-size:11.5px;text-align:center;padding:2px 8px;animation:lcmsg .25s}",
    ".lc-hint{display:flex;align-items:center;gap:6px}.lc-hint i{display:inline-block;width:5px;height:5px;border-radius:50%;background:#e11d48;animation:lcblink 1.2s infinite}.lc-hint i:nth-child(2){animation-delay:.2s}.lc-hint i:nth-child(3){animation-delay:.4s}@keyframes lcblink{0%,80%,100%{opacity:.25}40%{opacity:1}}",
    ".lc-sys button{border:0;background:none;color:#e11d48;font-weight:600;cursor:pointer;text-decoration:underline;font-size:11.5px}",
    ".lc-chips{display:flex;flex-wrap:wrap;gap:7px;padding:2px 0 2px 34px}",
    ".lc-pf{display:flex;flex-direction:column;gap:7px;width:100%;max-width:86%;white-space:normal}.lc-pf .lc-pt{font-weight:600;font-size:13px;line-height:1.35}.lc-pf input{width:100%;height:36px;padding:0 12px;border:1.5px solid #fbc9d3;border-radius:10px;background:#fff;font:13.5px Poppins,Arial,sans-serif;color:#1f2937;outline:0}.lc-pf input:focus{border-color:#e11d48}.lc-pf .lc-pe{min-height:0;color:#b91c1c;font-size:12px}.lc-pf .lc-pe:empty{display:none}.lc-pb{display:flex;gap:8px;align-items:center}.lc-pgo{border:0;border-radius:999px;background:var(--lc-g);color:#fff;font:600 13px Poppins,Arial,sans-serif;padding:8px 18px;cursor:pointer}.lc-pgo:disabled{opacity:.6;cursor:default}.lc-psk{border:0;background:none;color:#64748b;font:500 12.5px Poppins,Arial,sans-serif;text-decoration:underline;cursor:pointer;padding:6px}",
    ".lc-chip{border:1.5px solid #fecdd3;background:#fff;color:#9f1239;font:500 12.5px Poppins,Arial,sans-serif;padding:6px 12px;border-radius:999px;cursor:pointer;text-decoration:none;transition:all .15s}.lc-chip:hover{background:#e11d48;border-color:#e11d48;color:#fff;transform:translateY(-1px)}",
    ".lc-chip.wa{border-color:#b7ebcb;color:#15803d}.lc-chip.wa:hover{background:#25d366;border-color:#25d366;color:#fff}",
    ".lc-f{flex:none;display:flex;align-items:flex-end;gap:8px;padding:10px 10px 10px 12px;background:#fff;border-top:1px solid #eceef3}",
    ".lc-f textarea{flex:1;min-width:0;resize:none;border:1.5px solid #e5e7ee;outline:0;background:#fff7f5;font:14px/1.4 Poppins,Arial,sans-serif;padding:9px 14px;border-radius:18px;max-height:84px;height:38px;color:#1f2937;transition:border-color .15s,background .15s}.lc-f textarea:focus{border-color:#fb7185;background:#fff}.lc-f textarea::placeholder{color:#9aa3b2}",
    ".lc-send{flex:none;width:38px;height:38px;border:0;border-radius:50%;background:var(--lc-g);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s,opacity .15s;box-shadow:0 4px 12px rgba(225,29,72,.4)}.lc-send:hover{transform:scale(1.08)}.lc-send:active{transform:scale(.94)}.lc-send:disabled{opacity:.5;cursor:default;transform:none}.lc-send svg{width:18px;height:18px;fill:#fff;margin-left:2px}",
    ".lc-lb{flex:none;display:flex;align-items:center;gap:6px;height:30px;padding:0 10px 0 8px;border:0;border-radius:999px;background:rgba(255,255,255,.2);color:#fff;font:600 11.5px Poppins,Arial,sans-serif;cursor:pointer;transition:background .15s}.lc-lb:hover,.lc-lb[aria-expanded=true]{background:rgba(255,255,255,.35)}",
    ".lc-fl{width:20px;height:14px;border-radius:2px;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.15);flex:none;background:#e5e7eb}",
    ".lc-lm{position:absolute;top:62px;left:10px;right:10px;z-index:5;display:none;grid-template-columns:1fr 1fr;gap:2px;padding:8px;background:#fff;border-radius:16px;box-shadow:0 16px 40px rgba(30,27,75,.32)}.lc-lm.on{display:grid;animation:lcin .18s ease-out}",
    ".lc-lm button{display:flex;align-items:center;gap:10px;padding:10px;border:0;border-radius:10px;background:none;color:#1f2937;font:500 13.5px Poppins,Arial,sans-serif;cursor:pointer;text-align:start}.lc-lm button:hover{background:#fff1f2}.lc-lm button[aria-selected=true]{background:#ffe4e6;color:#881337;font-weight:600}",
    ".lc-note{align-self:center;display:flex;align-items:center;gap:8px;background:#fff7e0;color:#7a5b00;border:1px solid #f3dc9a;border-radius:999px;font-size:11.5px;padding:4px 5px 4px 12px;animation:lcmsg .25s}.lc-note button{border:0;background:#e11d48;color:#fff;border-radius:999px;font:600 11px Poppins,Arial,sans-serif;padding:3px 10px;cursor:pointer}",
    "#lc-box[dir=rtl] .lc-r.a .lc-m{border-radius:16px 16px 4px 16px}#lc-box[dir=rtl] .lc-r.v .lc-m{border-radius:16px 16px 16px 4px}#lc-box[dir=rtl] .lc-chips{padding:2px 34px 2px 0}#lc-box[dir=rtl] .lc-send svg{margin:0 2px 0 0;transform:scaleX(-1)}#lc-box[dir=rtl] .lc-r.v .lc-m small{text-align:left}#lc-tease[dir=rtl]{border-radius:14px 14px 14px 4px}",
    ".lc-lb:focus-visible,.lc-lm button:focus-visible,.lc-chip:focus-visible,.lc-send:focus-visible,.lc-hb:focus-visible{outline:2px solid #fbbf24;outline-offset:2px}.lc-lm button:focus-visible{outline-color:#e11d48}",
    "@media(min-width:481px){#lc-box{zoom:.88;right:18px;bottom:18px;width:min(376px,calc((100vw - 24px)/.88));height:min(580px,calc((100vh - 40px)/.88))}}",
    "#btt{bottom:88px!important;right:26px!important}",
    "#lc-tease{position:fixed;left:auto;right:82px;bottom:30px;border-radius:14px 14px 4px 14px}#lc-tease[dir=rtl]{border-radius:14px 14px 4px 14px}",
    "@media(max-width:480px){#lc-dock{left:12px;bottom:12px;gap:12px}#lc-wa,#lc-btn{width:43px;height:43px}#lc-wa{min-width:43px;max-width:43px;padding:0;border-radius:50%}#lc-wa .lc-wt{display:none}#lc-wa.x{border-radius:50%;padding:0}#lc-box{right:6px;bottom:6px;width:calc(100vw - 12px);height:calc((100vh - 24px)*.8)}#lc-tease{right:68px;bottom:20px}#lc-btn{right:12px;bottom:12px}}",
    "@media(prefers-reduced-motion:reduce){#lc-box *,#lc-btn::before,#lc-tease{animation:none!important}}"
  ].join("");
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ------------------------------------------------ helpers ------------------------------------------------ */
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function clearSession() { S = null; try { sessionStorage.removeItem(KEY); } catch (e) {} if (es) { es.close(); es = null; } }
  function hhmm(d) { try { return new Date(d || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
  function post(path, body) {
    return fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { success: false, message: "Something went wrong." }; }); })
      .then(function (j) { if (!j.success) throw new Error(j.message || "Something went wrong."); return j; }, function () { throw new Error("Connection problem. Please try again."); });
  }
  function linkify(node, text) {
    var re = /(https?:\/\/[^\s<]+)/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = el("a", "", m[0]); a.href = m[0]; a.target = "_blank"; a.rel = "nofollow ugc noopener noreferrer"; node.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
  }

  /* ------------------------------------------------ launcher buttons ------------------------------------------------ */
  var dock = el("div"); dock.id = "lc-dock";
  var wa = el("a"); wa.id = "lc-wa"; wa.target = "_blank"; wa.rel = "noopener";
  var WA_TEXT = CFG.text || "Hi, I need expert help";
  function setWa() {
    wa.href = "https://wa.me/" + WA + "?text=" + encodeURIComponent(WA_TEXT);
    /* navbar WhatsApp icon (phone version) uses the same number + text */
    Array.prototype.forEach.call(document.querySelectorAll(".nmc-wa"), function (a) { if (WA) a.href = wa.href; });
    /* the same number, shown in the top bar next to the WhatsApp icon (e.g. +1 415 555 0100) */
    if (WA) Array.prototype.forEach.call(document.querySelectorAll(".nmc-wa-num"), function (n) { n.textContent = "+" + (WA.length === 11 && WA.charAt(0) === "1" ? "1 " + WA.slice(1, 4) + " " + WA.slice(4, 7) + " " + WA.slice(7) : WA); });
    if (!WA) wa.removeAttribute("href"); // no number yet: the icon stays visible and opens live chat (see click handler)
  }
  wa.addEventListener("click", function (e) { if (!WA) { e.preventDefault(); openBox(); } });
  setWa();
  function loadCfg() {
    fetch(API + "/config").then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.success && j.whatsapp) { WA = String(j.whatsapp).replace(/\D/g, ""); if (j.text) WA_TEXT = j.text; setWa(); }
    }).catch(function () {});
  }
  /* not part of the critical path: wait for load + idle (the number from AH_LIVECHAT is already used until then) */
  (function () { (window.requestIdleCallback || function (f) { setTimeout(f, 1500); })(loadCfg, { timeout: 4000 }); })();
  wa.setAttribute("aria-label", "Chat with us on WhatsApp"); wa.title = "Chat on WhatsApp";
  wa.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg><span class="lc-wt">Order/Chat On Whats</span>';
  /* WhatsApp icon -> "Order/Chat On Whats" button: opens by itself after 20 s (then folds back after 8 s) and whenever the pointer or keyboard focus is on it */
  (function () {
    var hov = false, auto = null, fold = null;
    function open() { if (isPhone()) return; clearTimeout(fold); wa.classList.add("x"); }
    function close() { if (!hov) { wa.classList.remove("x"); } }
    wa.addEventListener("mouseenter", function () { hov = true; open(); });
    wa.addEventListener("mouseleave", function () { hov = false; clearTimeout(fold); fold = setTimeout(close, 300); });
    wa.addEventListener("focus", function () { hov = true; open(); });
    wa.addEventListener("blur", function () { hov = false; fold = setTimeout(close, 300); });
    auto = setTimeout(function () { if (isPhone()) return; open(); fold = setTimeout(close, 8000); }, 20000);
  })();

  var btn = el("button"); btn.id = "lc-btn"; btn.type = "button";
  btn.setAttribute("aria-label", "Open live chat"); btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = '<svg class="ic-hs" viewBox="0 0 32 32" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 17v-2a10 10 0 0 1 20 0v2"/><rect x="3.5" y="16" width="4.5" height="7" rx="2"/><rect x="24" y="16" width="4.5" height="7" rx="2"/><path d="M26 23v1.5a3 3 0 0 1-3 3h-4"/><rect x="11" y="10.5" width="10" height="8" rx="2"/><path d="M14 18.5v3l3.2-3"/></svg>' +
    '<svg class="ic-x" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var tease = el("div"); tease.id = "lc-tease";
  var teaseTxt = el("span", "", "\uD83D\uDC4B Need help? Chat with an expert");
  var teaseX = el("button", "", "\u00D7"); teaseX.type = "button"; teaseX.setAttribute("aria-label", "Dismiss");
  tease.appendChild(teaseTxt); tease.appendChild(teaseX);
  dock.appendChild(tease); dock.appendChild(wa); dock.appendChild(btn);

  /* ------------------------------------------------ chat window ------------------------------------------------ */
  var box = el("div"); box.id = "lc-box"; box.setAttribute("translate", "no"); box.classList.add("notranslate"); dock.setAttribute("translate", "no"); dock.classList.add("notranslate"); box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Live chat");

  var head = el("div", "lc-h");
  var logo = el("span", "lc-logo"), img = el("img"); img.src = "img/logo.webp"; img.alt = ""; img.onerror = function () { logo.textContent = BRAND.charAt(0); }; logo.appendChild(img);
  var bt = el("div", "lc-bt"), bname = el("b", "", BRAND), bsub = el("small", "lc-ag"), bsubI = avImg(PI, ""), bsubT = el("span", "", PERSONAS[PI].n); bsubI.removeAttribute("class"); bsubI.width = 20; bsubI.height = 20; bsub.appendChild(bsubI); bsub.appendChild(bsubT); bt.appendChild(bname); bt.appendChild(bsub);
  var minB = el("button", "lc-hb"); minB.type = "button"; minB.setAttribute("aria-label", "Minimise chat"); minB.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>';
  var xB = el("button", "lc-hb"); xB.type = "button"; xB.setAttribute("aria-label", "End chat"); xB.title = "End chat"; xB.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var lb = el("button", "lc-lb"), lbF = el("img", "lc-fl"), lbN = el("span");
  lb.type = "button"; lb.setAttribute("aria-haspopup", "listbox"); lb.setAttribute("aria-expanded", "false"); lbF.alt = ""; lbF.onerror = function () { lbF.style.visibility = "hidden"; };
  lb.appendChild(lbF); lb.appendChild(lbN);
  var lm = el("div", "lc-lm"); lm.setAttribute("role", "listbox");
  function toggleMenu(on) { lm.classList.toggle("on", on); lb.setAttribute("aria-expanded", on ? "true" : "false"); if (on) { var s = lm.querySelector("[aria-selected=true]"); if (s) s.focus(); } }
  function buildMenu() {
    lm.innerHTML = "";
    ORDER.forEach(function (k) {
      var b = el("button"), im = el("img", "lc-fl"); b.type = "button"; b.setAttribute("role", "option"); b.setAttribute("aria-selected", k === lang ? "true" : "false");
      im.src = flagUrl(LANGS[k].f); im.alt = ""; im.loading = "lazy"; im.onerror = function () { im.style.visibility = "hidden"; };
      b.appendChild(im); b.appendChild(el("span", "", LANGS[k].n));
      b.onclick = function () { applyLang(k, true); toggleMenu(false); input.focus(); };
      lm.appendChild(b);
    });
  }
  lb.onclick = function (e) { e.stopPropagation(); toggleMenu(!lm.classList.contains("on")); };
  [logo, bt, lb, minB, xB].forEach(function (n) { head.appendChild(n); });

  var log = el("div", "lc-log"); log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite");

  var foot = el("div", "lc-f"), input = el("textarea"), send = el("button", "lc-send");
  input.rows = 1; input.placeholder = "Type your message\u2026"; input.maxLength = 1000; input.setAttribute("aria-label", "Type your message");
  send.type = "button"; send.setAttribute("aria-label", "Send message"); send.title = "Send (Enter)";
  send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.3 3.2a1 1 0 0 1 1.1-.2l18 8.4a1 1 0 0 1 0 1.8l-18 8.4a1 1 0 0 1-1.4-1.1L3.9 13l8.6-1-8.6-1L2 4.3a1 1 0 0 1 .3-1.1z"/></svg>';
  foot.appendChild(input); foot.appendChild(send);

  box.appendChild(head); box.appendChild(log); box.appendChild(foot); box.appendChild(lm);
  box.addEventListener("click", function (e) { if (lm.classList.contains("on") && !lm.contains(e.target) && !lb.contains(e.target)) toggleMenu(false); });
  document.body.appendChild(dock); document.body.appendChild(box);

  /* ------------------------------------------------ rendering ------------------------------------------------ */
  function hasVisitorMsg() { return ((S && S.msgs) || []).some(function (m) { return m.sender === "visitor"; }); }
  function hasAgentMsg() { return ((S && S.msgs) || []).some(function (m) { return m.sender === "agent"; }); }

  function welcome() {
    var r = el("div", "lc-r a"), av = avImg(agentIdx(S && S.agent)), m = el("div", "lc-m");
    m.appendChild(document.createTextNode(T("hello")));
    r.appendChild(av); r.appendChild(m); return r;
  }
  function chipsRow() {
    var row = el("div", "lc-chips"); row.id = "lc-chips";
    (CFG.chips || T("chips")).forEach(function (t) {
      var c = el("button", "lc-chip", t); c.type = "button";
      c.onclick = function () { doSend(t); };
      row.appendChild(c);
    });
    var w = el("a", "lc-chip wa", T("wa")); w.href = wa.href; w.target = "_blank"; w.rel = "noopener"; row.appendChild(w);
    return row;
  }
  function bubble(m) {
    if (m.sender === "system") return el("div", "lc-sys", m.body);
    var v = m.sender === "visitor", r = el("div", "lc-r " + (v ? "v" : "a")), b = el("div", "lc-m");
    linkify(b, m.body);
    var meta = (v ? "" : (m.sender_name ? m.sender_name + " \u00B7 " : "")) + hhmm(m.created_at);
    b.appendChild(el("small", "", meta));
    if (!v) r.appendChild(avImg(agentIdx(m.sender_name)));
    r.appendChild(b); return r;
  }
  function scroll() { if (!open) return; log.scrollTop = log.scrollHeight; }   /* closed box is display:none; reading scrollHeight then only forced a reflow */
  function hint() {
    var old = log.querySelector(".lc-hint"); if (old) old.remove();
    if (S && !S.closed && hasVisitorMsg() && !hasAgentMsg()) {
      var h = el("div", "lc-hint"); h.appendChild(el("i")); h.appendChild(el("i")); h.appendChild(el("i"));
      h.appendChild(document.createTextNode(T("sent"))); log.appendChild(h); scroll();
    }
  }
  /* After 3 messages the chat asks for a name (and an optional contact number); the support console updates at once. */
  function visitorCount() { return ((S && S.msgs) || []).filter(function (m) { return m.sender === "visitor"; }).length; }
  function profileCard() {
    var r = el("div", "lc-r a"), m = el("div", "lc-m lc-pf");
    r.id = "lc-prof"; r.appendChild(avImg(agentIdx(S && S.agent)));
    var h = el("div", "lc-pt", "To help you better, please tell us your name and contact number (optional)."),
      n = el("input"), ph = el("input"), er = el("div", "lc-pe"), row = el("div", "lc-pb"), go = el("button", "lc-pgo", "Submit"), sk = el("button", "lc-psk", "Skip");
    n.type = "text"; n.maxLength = 120; n.placeholder = "Your name"; n.autocomplete = "name"; n.setAttribute("aria-label", "Your name");
    ph.type = "tel"; ph.maxLength = 25; ph.placeholder = "Contact number (optional)"; ph.autocomplete = "tel"; ph.setAttribute("aria-label", "Contact number (optional)");
    go.type = "button"; sk.type = "button";
    function gone() { if (r.parentNode) r.remove(); }
    function submit() {
      var nm = n.value.trim(), pn = ph.value.trim();
      if (!nm) { er.textContent = "Please enter your name."; n.focus(); return; }
      if (pn && pn.replace(/\D/g, "").length < 6) { er.textContent = "Please enter a valid number or leave it empty."; ph.focus(); return; }
      er.textContent = ""; go.disabled = true;
      post("/" + S.id + "/profile", { token: S.token, name: nm, phone: pn }).then(function (j) {
        S.prof = 1; S.name = j.name; save(); gone();
        log.appendChild(el("div", "lc-sys", "Thank you, " + j.name + "! Your details were shared with our team.")); scroll();
      }, function (e) { go.disabled = false; er.textContent = e.message || "Could not save. Please try again."; });
    }
    go.onclick = submit;
    sk.onclick = function () { S.prof = 1; save(); gone(); };
    [n, ph].forEach(function (i) { i.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } e.stopPropagation(); }); });
    row.appendChild(go); row.appendChild(sk);
    [h, n, ph, er, row].forEach(function (x) { m.appendChild(x); });
    r.appendChild(m); return r;
  }
  function maybeAsk() {
    if (!S || S.closed || S.prof || S.ask || visitorCount() < 3) return;
    S.ask = 1; save(); log.appendChild(profileCard()); scroll();
  }
  function renderLog() {
    log.innerHTML = ""; log.appendChild(welcome());
    if (noteOn) log.appendChild(noteEl());
    if (!hasVisitorMsg() && !pending.length) log.appendChild(chipsRow());
    ((S && S.msgs) || []).forEach(function (m) { log.appendChild(bubble(m)); });
    pending.forEach(function (q) { if (!q.done) log.appendChild(q.node); });
    if (S && S.ask && !S.prof && !S.closed) log.appendChild(profileCard());
    if (S && S.closed) {
      var d = el("div", "lc-sys", T("ended")), n = el("button", "", T("again")); n.type = "button";
      n.onclick = function () { clearSession(); renderLog(); updateSub(); input.focus(); };
      d.appendChild(n); log.appendChild(d);
    }
    hint(); scroll();
  }
  function updateSub() { var i = agentIdx(S && S.agent && !S.closed ? S.agent : null); if (!bsubI.parentNode || bsubI.tagName !== "IMG") { var n = avImg(i, ""); n.removeAttribute("class"); n.width = 20; n.height = 20; if (bsubI.parentNode) bsub.replaceChild(n, bsubI); bsubI = n; } else setAv(bsubI, i); bsubT.textContent = PERSONAS[i].n; }
  function noteEl() {
    var d = el("div", "lc-note"), c = el("button", "", T("chg")); c.type = "button"; c.onclick = function () { toggleMenu(true); };
    d.appendChild(el("span", "", T("det") + ": " + LANGS[lang].n)); d.appendChild(c); return d;
  }
  function applyLang(l, manual) {
    if (!LANGS[l]) return;
    lang = l; if (manual) { try { localStorage.setItem(LKEY, l); } catch (e) {} noteOn = false; }
    var dir = LANGS[l].rtl ? "rtl" : "ltr";
    box.setAttribute("dir", dir); box.setAttribute("lang", l); tease.setAttribute("dir", dir);
    lbF.src = flagUrl(LANGS[l].f); lbN.textContent = l.toUpperCase(); lb.setAttribute("aria-label", T("lang") + ": " + LANGS[l].n); lb.title = T("lang");
    input.placeholder = T("ph"); input.setAttribute("aria-label", T("ph"));
    teaseTxt.textContent = T("tease");
    btn.setAttribute("aria-label", open ? T("min") : T("open")); minB.setAttribute("aria-label", T("min")); xB.setAttribute("aria-label", T("end")); xB.title = T("end");
    buildMenu(); updateSub(); renderLog();
  }
  function badge() { var d = btn.querySelector(".dot"); if (d) d.remove(); if (unread) btn.appendChild(el("span", "dot", unread > 9 ? "9+" : unread)); }


  /* ---- message alert: tab title shows the message + sound (both directions) ---- */
  var ntBase = null, ntIv = null, ntOff = null, ntCtx = null;
  function ntAudio() { try { if (!ntCtx) ntCtx = new (window.AudioContext || window.webkitAudioContext)(); if (ntCtx.state === "suspended") ntCtx.resume(); } catch (e) {} return ntCtx; }
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { window.addEventListener(ev, ntAudio, { passive: true }); });
  function ntTone(freqs) {
    var c = ntAudio(); if (!c) return;
    freqs.forEach(function (f, i) {
      try {
        var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + i * 0.16;
        o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(c.destination);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        o.start(t); o.stop(t + 0.16);
      } catch (e) {}
    });
  }
  function ntRestore() {
    if (ntIv) { clearInterval(ntIv); ntIv = null; }
    if (ntOff) { clearTimeout(ntOff); ntOff = null; }
    if (ntBase !== null) { document.title = ntBase; ntBase = null; }
  }
  function ntTitle(who, body) {
    var txt = "\uD83D\uDCAC " + (who ? who + ": " : "") + String(body || "").replace(/\s+/g, " ").trim().slice(0, 70);
    if (ntBase === null) ntBase = document.title;
    if (ntIv) { clearInterval(ntIv); ntIv = null; } if (ntOff) { clearTimeout(ntOff); ntOff = null; }
    document.title = txt;
    if (document.hidden) {
      var on = true;
      ntIv = setInterval(function () { on = !on; document.title = on ? txt : ntBase; }, 1000);
    } else { ntOff = setTimeout(ntRestore, 6000); }
  }
  function notifyMsg(who, body, mine) { ntTone(mine ? [660] : [880, 1175]); ntTitle(who, body); }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) ntRestore(); });
  window.addEventListener("focus", ntRestore);

  function addLive(m) {
    S.msgs = S.msgs || [];
    if (S.msgs.some(function (x) { return x.id === m.id; })) return;
    if (m.sender === "visitor") { var q = pending.filter(function (x) { return !x.done && x.body === m.body; })[0]; if (q) { settle(q, m); return; } }
    S.msgs.push(m); if (S.msgs.length > 300) S.msgs.shift(); save();
    var ch = document.getElementById("lc-chips"); if (ch) ch.remove();
    log.appendChild(bubble(m)); hint(); scroll();
    if (m.sender === "agent" && !open) { unread++; badge(); }
    if (m.sender === "agent") notifyMsg(m.sender_name || BRAND, m.body, false);
  }

  /* ------------------------------------------------ open / close ------------------------------------------------ */
  function hideTease() { tease.classList.remove("on"); }
  function openBox() {
    open = true; box.classList.add("on"); dock.classList.add("open"); btn.setAttribute("aria-expanded", "true"); btn.setAttribute("aria-label", T("min"));
    hideTease(); unread = 0; badge(); renderLog(); setTimeout(function () { input.focus(); }, 80);
    window.dispatchEvent(new CustomEvent("ah-livechat-open"));
  }
  function minimise(silent) {
    open = false; box.classList.remove("on"); dock.classList.remove("open"); dock.classList.add("seen");
    btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-label", T("open"));
    if (silent !== true) { try { sessionStorage.setItem(DISMISS, "1"); } catch (e) {} }
  }
  // The AI assistant box is being used: tuck the live chat away (and never auto-open over it).
  window.addEventListener("ah-assistant-open", function () { if (open) minimise(true); });
  // The expert (submit) form is being used: minimise the live chat and never auto-open over it.
  window.addEventListener("ah-form-active", function () { hideTease(); if (open) minimise(true); });
  btn.onclick = function () { open ? minimise() : openBox(); };
  /* public API: any "Expert Help" button on the site can open the chat box (it never opens by itself when autoOpenDelay is -1) */
  window.AHLiveChat = { open: openBox, close: minimise, isOpen: function () { return open; } };
  window.addEventListener("ah-open-livechat", function () { openBox(); });
  if (window.__ahWantChat) { window.__ahWantChat = 0; openBox(); }
  minB.onclick = function () { minimise(); };
  tease.onclick = function (e) { if (e.target === teaseX) { hideTease(); return; } openBox(); };
  xB.onclick = function () {
    if (S && !S.closed && hasVisitorMsg()) {
      post("/" + S.id + "/end", { token: S.token }).catch(function () {});
    }
    minimise();
  };
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) { if (lm.classList.contains("on")) { toggleMenu(false); lb.focus(); } else minimise(); } });

  /* ------------------------------------------------ sending (Enter key + arrow button) ------------------------------------------------ */
  function grow() { input.style.height = "38px"; input.style.height = Math.min(input.scrollHeight, 84) + "px"; }

  /* A message is drawn in the chat the moment it is chosen / sent. The network call runs in the background and the
     bubble is confirmed (or marked "not sent - retry") when it finishes. */
  function settle(q, m) {
    if (q.done) return; q.done = true;
    pending = pending.filter(function (x) { return x !== q; });
    q.node.setAttribute("data-mid", m.id);
    var sm = q.node.querySelector("small"); if (sm) sm.textContent = hhmm(m.created_at);
    q.node.classList.remove("fail");
    var rb = q.node.querySelector(".lc-retry"); if (rb) rb.remove();
    if (S) { S.msgs = S.msgs || []; if (!S.msgs.some(function (x) { return x.id === m.id; })) { S.msgs.push(m); save(); } }
    hint(); maybeAsk();
  }
  function transmit(v) {
    if (S) return post("/" + S.id + "/messages", { token: S.token, body: v }).then(function (j) { return j.message; });
    if (startP) return startP.then(function () { return transmit(v); });
    var pg = (window.AH_PAGE && window.AH_PAGE()) || { page_url: location.href.replace(/#.*$/, ""), page_title: document.title || "" };
    var p = post("/start", { message: v, vid: window.AH_VID || "", persona: PI, page_url: pg.page_url, page_title: pg.page_title }).then(function (j) {
      if (typeof j.persona === "number" && PERSONAS[j.persona]) { PI = j.persona; try { localStorage.setItem(PKEY, String(PI)); } catch (e) {} }
      S = { id: j.id, token: j.token, msgs: j.message ? [j.message] : [], agent: null, closed: false, persona: PI }; save();
      connect(); sync(); updateSub();
      return j.message;
    });
    startP = p; var clr = function () { if (startP === p) startP = null; }; p.then(clr, clr);
    return p;
  }
  function failBubble(q, err) {
    q.node.classList.add("fail");
    if (q.node.querySelector(".lc-retry")) return;
    var rb = el("button", "lc-retry", T("retry")); rb.type = "button";
    rb.onclick = function () { rb.remove(); q.node.classList.remove("fail"); run(q); };
    q.node.querySelector(".lc-m").appendChild(rb);
    q.node.querySelector(".lc-m").title = err && err.message ? err.message : "";
  }
  function run(q) { transmit(q.body).then(function (m) { if (m) settle(q, m); }, function (e) { failBubble(q, e); }); }
  function doSend(text) {
    var v = String(text != null ? text : input.value).trim();
    if (!v) return;
    if (S && S.closed) { clearSession(); updateSub(); }
    if (text == null) { input.value = ""; grow(); }
    send.disabled = !input.value.trim();
    var q = { body: v, done: false, node: null };
    q.node = bubble({ id: "tmp" + (++tmpN), sender: "visitor", body: v, created_at: new Date().toISOString() });
    pending.push(q);
    var ch = document.getElementById("lc-chips"); if (ch) ch.remove();
    log.appendChild(q.node); scroll();
    notifyMsg("You", v, true);
    run(q);
    input.focus();
  }
  send.addEventListener("click", function () { doSend(); });
  input.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.keyCode === 13) && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSend(); }
  });
  input.addEventListener("input", function () { grow(); send.disabled = !input.value.trim(); });

  /* quiet catch-up after a chat starts: add anything the stream missed, without redrawing the window */
  function sync() {
    if (!S) return;
    var id = S.id, tk = S.token;
    fetch(API + "/" + id + "/messages?token=" + encodeURIComponent(tk)).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.success || !S || S.id !== id) return;
      if (j.agent_name && !S.agent) { S.agent = j.agent_name; save(); updateSub(); }
      (j.messages || []).forEach(function (m) { if (!S.msgs.some(function (x) { return x.id === m.id; })) addLive(m); });
    }).catch(function () {});
  }

  function connect() {
    if (es) es.close();
    es = new EventSource(API + "/" + S.id + "/stream?token=" + encodeURIComponent(S.token));
    es.addEventListener("message", function (ev) {
      var m = JSON.parse(ev.data);
      if (m.sender === "agent" && !S.agent) { S.agent = m.sender_name; save(); updateSub(); }
      addLive(m);
    });
    es.addEventListener("joined", function (ev) { S.agent = JSON.parse(ev.data).agent_name; save(); updateSub(); });
    es.addEventListener("closed", function () { S.closed = true; save(); es.close(); es = null; updateSub(); if (open) renderLog(); });
  }

  function load() {
    return fetch(API + "/" + S.id + "/messages?token=" + encodeURIComponent(S.token)).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.success) { clearSession(); renderLog(); updateSub(); return; }
      S.msgs = j.messages; S.agent = j.agent_name; S.closed = j.status === "closed"; if (typeof j.persona === "number" && PERSONAS[j.persona]) S.persona = j.persona; save();
      if (!S.closed) connect();
      updateSub(); renderLog();
    }).catch(function () {});
  }

  function assistantBusy() { var f = document.getElementById("ah-cb-form"), p = document.getElementById("ah-cb-panel"); return !!((p && p.classList.contains("open")) || (f && f.contains(document.activeElement))); }

  /* ------------------------------------------------ boot ------------------------------------------------ */
  send.disabled = true;
  applyLang(lang, false);
  window.addEventListener("ah-lang", function (e) { var l = e.detail && e.detail.lang; if (l && l !== lang) applyLang(l, true); });
  if (S) load();
  document.addEventListener("visibilitychange", function () { if (S && !S.closed && document.visibilityState === "visible") load(); });
  /* phone / touch device: the chat opens ONLY when the visitor taps the button (never by itself) */
  function isPhone() {
    try {
      return !!((window.matchMedia && (matchMedia("(max-width:767px)").matches || (matchMedia("(pointer:coarse)").matches && matchMedia("(max-width:1024px)").matches))) ||
        /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(navigator.userAgent || ""));
    } catch (e) { return false; }
  }
  var phone = isPhone();
  var dismissed = false; try { dismissed = !!sessionStorage.getItem(DISMISS); } catch (e) {}
  if (phone) { /* no automatic open / teaser on phones */ }
  else if (DELAY >= 0 && !dismissed) setTimeout(function () { if (!open && !isPhone() && !assistantBusy() && !window.__ahFormActive) openBox(); }, DELAY);
  else if (!dismissed && CFG.tease !== false) setTimeout(function () { if (!open && !isPhone() && !window.__ahFormActive) { tease.classList.add("on"); setTimeout(hideTease, 9000); } }, 6000);
})();
