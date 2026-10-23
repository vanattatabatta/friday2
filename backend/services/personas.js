"use strict";
/* Display names for the 10 support agents shown in the website chat. The ORDER must match PERSONAS in js/livechat.js
   (the visitor's browser sends only the index; the name is looked up here, so visitors cannot invent names). */
const NAMES = [
  "Emily Carter", "Michael Brooks", "Jessica Miller", "Daniel Harris", "Ashley Johnson",
  "Brandon Walker", "Olivia Bennett", "Jason Mitchell", "Megan Collins", "Ryan Thompson"
];
const name = (i) => (Number.isInteger(i) && i >= 0 && i < NAMES.length ? NAMES[i] : null);
const pick = () => Math.floor(Math.random() * NAMES.length);
module.exports = { NAMES, name, pick };
