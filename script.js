// made with love, for the special one — Rika 🌸
// Bloom by Unravel Labs — clean rewrite

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, orderBy, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── CONFIG — paste your keys here ───
const firebaseConfig = {
  apiKey: "AIzaSyD2eqnaOcch-YpvG9vgF1u6hOyWsXZeC3g",
  authDomain: "unravellabsfr.firebaseapp.com",
  projectId: "unravellabsfr",
  storageBucket: "unravellabsfr.firebasestorage.app",
  messagingSenderId: "283465809170",
  appId: "1:283465809170:web:37fa57f79c0182b96cc7cb",
  measurementId: "G-6ZBRZ2X4CD"
};

const GROQ_API_KEY = "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";
const MODEL_VENT     = "meta-llama/llama-4-scout-17b-16e-instruct";
const MODEL_ARGUE    = "moonshotai/kimi-k2-instruct";
const MODEL_FALLBACK = "llama-3.3-70b-versatile";
const JAZZ_PASSWORD  = "kaokao";

// ─── INIT ───
const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);
setPersistence(auth, browserLocalPersistence);

// ─── STATE ───
let user = null, uData = {}, cycleInfo = {}, memory = "", userSelfInfo = "";
let chatMode = "vent", activeBot = "epipen", jazzUnlocked = false;
let periodDays = new Set(), diaryDays = new Set();
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth();
let rangeMode = null, rangeStart = null, diaryDate = null;
let currentFlow = null, sleepQuality = null;
let gratitudes = [], visionTiles = [], memoryJar = [];
let deferredInstall = null;
const botHist = { epipen: [], chinatsu: [], jazz: [] };
const botSession = { epipen: null, chinatsu: null, jazz: null };

// ─── GROQ ───
async function groq(prompt, temp = 0.85, maxTok = 280, model = MODEL_VENT) {
  return groqChat([{ role: "user", content: prompt }], temp, maxTok, model);
}

async function groqChat(messages, temp = 0.85, maxTok = 280, model = MODEL_VENT) {
  const tryModel = async m => {
    const res  = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: m, messages, max_tokens: maxTok, temperature: temp })
    });
    const data = await res.json();
    if (res.status === 429) throw new Error("rate_limited");
    if (!data.choices?.[0]?.message?.content) throw new Error("no content");
    return data.choices[0].message.content.trim();
  };
  try { return await tryModel(model); }
  catch (e) {
    if (model !== MODEL_FALLBACK) return await tryModel(MODEL_FALLBACK);
    throw e;
  }
}

// ─── LOADING SCREEN ───
function hideLoading() {
  const el = document.getElementById("loading");
  if (!el) return;
  el.style.opacity = "0";
  el.style.transition = "opacity 0.5s ease";
  setTimeout(() => el.style.display = "none", 500);
}

// ─── STARS ───
function initStars() {
  const c = document.getElementById("stars");
  if (!c) return;
  const ctx = c.getContext("2d");
  let stars = [];
  const resize = () => { c.width = innerWidth; c.height = innerHeight; };
  const make = () => { stars = Array.from({ length: 200 }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, r: Math.random() * 1.4 + 0.2, a: Math.random(), speed: Math.random() * .006 + .003, dir: Math.random() > .5 ? 1 : -1, drift: (Math.random() - .5) * .018, warm: Math.random() > .5 })); };
  const draw = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    stars.forEach(s => {
      s.a += s.speed * s.dir; if (s.a > 1 || s.a < .05) s.dir *= -1;
      s.x += s.drift; if (s.x < 0) s.x = c.width; if (s.x > c.width) s.x = 0;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.warm ? `rgba(232,160,200,${s.a.toFixed(2)})` : `rgba(196,160,240,${s.a.toFixed(2)})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  };
  resize(); make(); draw();
  window.addEventListener("resize", () => { resize(); make(); });
  // parallax on desktop
  if (window.innerWidth >= 768) {
    window.addEventListener("mousemove", e => {
      const mx = (e.clientX / innerWidth - 0.5) * 14;
      const my = (e.clientY / innerHeight - 0.5) * 8;
      c.style.transform = `translate(${mx}px,${my}px)`;
    });
  }
}

function initPetals() {
  const wrap = document.getElementById("petals");
  if (!wrap) return;
  const emojis = ["🌸", "🌺", "🌷", "✿", "🌸"];
  for (let i = 0; i < 10; i++) {
    const el = document.createElement("span");
    el.className = "petal"; el.textContent = emojis[i % emojis.length];
    el.style.cssText = `left:${Math.random() * 100}%;animation-duration:${Math.random() * 18 + 14}s;animation-delay:${-Math.random() * 20}s;font-size:${Math.random() * .5 + .5}rem`;
    wrap.appendChild(el);
  }
}

function initShootingStars() {
  if (window.innerWidth < 768) return;
  const shoot = () => {
    const el = document.createElement("div");
    el.className = "shooting-star";
    el.style.cssText = `left:${Math.random() * 60}vw;top:${Math.random() * 40}vh;animation-duration:${Math.random() * .5 + .3}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
    setTimeout(shoot, Math.random() * 18000 + 8000);
  };
  setTimeout(shoot, 4000);
}

// ─── SCREENS ───
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.style.display = "none");
  const el = document.getElementById(`s-${id}`);
  if (el) el.style.display = "block";
}

// ─── AUTH ───
document.getElementById("btn-google").addEventListener("click", async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { console.error(e); toast("sign in failed 😭"); }
});

onAuthStateChanged(auth, async u => {
  if (u) {
    user = u;
    try {
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) { uData = snap.data(); hideLoading(); launch(); }
      else { hideLoading(); showScreen("onboard"); }
    } catch (e) { console.error(e); hideLoading(); showScreen("onboard"); }
  } else { hideLoading(); showScreen("auth"); }
});

// ─── ONBOARD ───
window.obNext = async step => {
  if (step === 1) {
    const nm = document.getElementById("ob-name").value.trim();
    if (!nm) { toast("tell me your name first 🌸"); return; }
    uData.name = nm;
    document.getElementById("ob1").classList.remove("active");
    document.getElementById("ob2").classList.add("active");
    document.getElementById("ob2").style.animation = "fadeUp .4s ease both";
    document.getElementById("ob-prog-fill").style.width = "66%";
    document.getElementById("ob-cycle").value = new Date().toISOString().split("T")[0];
  } else {
    const dt = document.getElementById("ob-cycle").value;
    if (!dt) { toast("pick a date 🌙"); return; }
    uData.cycleStart = dt;
    document.getElementById("ob2").classList.remove("active");
    document.getElementById("ob3").classList.add("active");
    document.getElementById("ob-prog-fill").style.width = "100%";
    uData = { ...uData, cycleLength: 28, epiName: "Epipen", epiEmoji: "💉", uid: user.uid, photoURL: user.photoURL || null, settings: { checkin: true, compliments: true }, theme: "lavender", darkMode: true, createdAt: new Date().toISOString() };
    await setDoc(doc(db, "users", user.uid), uData);
  }
};

window.obSkip = () => {
  uData.cycleStart = new Date().toISOString().split("T")[0];
  document.getElementById("ob2").classList.remove("active");
  document.getElementById("ob3").classList.add("active");
  document.getElementById("ob-prog-fill").style.width = "100%";
};

window.obFinish = async () => {
  if (!uData.uid) {
    uData = { ...uData, cycleLength: 28, epiName: "Epipen", epiEmoji: "💉", uid: user.uid, photoURL: user.photoURL || null, settings: { checkin: true, compliments: true }, theme: "lavender", darkMode: true, createdAt: new Date().toISOString() };
    await setDoc(doc(db, "users", user.uid), uData);
  }
  launch();
};

// ─── LAUNCH ───
async function launch() {
  showScreen("app");
  applyTheme(uData.theme || "lavender");
  // restore settings
  const isDark = uData.darkMode !== false;
  document.body.setAttribute("data-mode", isDark ? "dark" : "light");
  const tdark = document.getElementById("tog-dark"); if (tdark) tdark.checked = isDark;
  if (uData.settings?.checkin !== undefined) { const t = document.getElementById("tog-checkin"); if (t) t.checked = uData.settings.checkin; }
  if (uData.settings?.compliments !== undefined) { const t = document.getElementById("tog-compliments"); if (t) t.checked = uData.settings.compliments; }
  if (uData.notifs && Notification.permission === "granted") { const t = document.getElementById("tog-notifs"); if (t) t.checked = true; }
  if (uData.theme === "kawaii") { document.getElementById("kawaii-picker").style.display = "block"; if (uData.kawaiiVariant) document.body.setAttribute("data-kw", uData.kawaiiVariant); }

  setupTopbar(); setupGreeting(); computeCycle();
  loadStreak(); loadMemory(); loadCalData(); loadSelfInfo();
  fetchAffirmation(); loadChiHomeWidget(); loadMoodWeather();
  loadDailyChallenge(); loadMemoryJar(); loadVisionBoard();
  checkCycleLetter(); checkWeeklyLetter();
  initDesktopSidebar();
  if (uData.settings?.compliments !== false) scheduleCompliment();
  scheduleChiAdvice(); scheduleJazzCheckin();
  setTimeout(checkPatterns, 5000);
  if (uData.settings?.checkin !== false) setTimeout(() => openGate(), 800);
  if (uData.streak && [7, 14, 30].includes(uData.streak)) setTimeout(() => showStreakReward(uData.streak), 2500);

  // keyboard listeners
  ["epipen", "chinatsu", "jazz"].forEach(bot => {
    const inp = document.getElementById(`in-${bot}`);
    if (inp) inp.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendBot(bot); } });
  });
  document.getElementById("ba-in")?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); sendBA(); } });
  document.getElementById("jazz-pw")?.addEventListener("keydown", e => { if (e.key === "Enter") tryJazzPw(); });
}

// ─── TOPBAR / SIDEBAR ───
function setupTopbar() {
  const wrap = document.getElementById("av-wrap");
  if (!wrap) return;
  wrap.innerHTML = "";
  const div = document.createElement("div");
  div.style.cssText = "width:26px;height:26px;border-radius:50%;border:1.5px solid var(--ame);cursor:pointer;overflow:hidden;flex-shrink:0";
  if (uData.photoURL) {
    div.innerHTML = `<img src="${uData.photoURL}" style="width:100%;height:100%;object-fit:cover"/>`;
  } else {
    div.style.cssText += ";background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:700";
    div.textContent = (uData.name || "B")[0].toUpperCase();
  }
  wrap.appendChild(div);
  syncEpipen();
}

function syncEpipen() {
  const ee = uData.epiEmoji || "💉", en = uData.epiName || "Epipen";
  [["bc-epi-av", ee], ["bc-epi-name", en]].forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.textContent = v; });
}

function setupGreeting() {
  const h  = new Date().getHours();
  const gt = h < 12 ? "good morning" : h < 17 ? "good afternoon" : h < 21 ? "good evening" : "hey night owl ✨";
  document.getElementById("gr-time").textContent = gt;
  document.getElementById("gr-name").textContent = uData.name || "bestie";
}

function initDesktopSidebar() {
  if (window.innerWidth < 768) return;
  const nav = document.getElementById("main-nav");
  if (!nav || nav.querySelector(".nav-brand")) return;
  const brand = document.createElement("div");
  brand.className = "nav-brand";
  brand.innerHTML = `<span class="nav-brand-logo">bloom 🌸</span><span class="nav-brand-tag">you bloom with dignity</span>`;
  nav.insertBefore(brand, nav.firstChild);
  const footer = document.createElement("div");
  footer.className = "nav-footer";
  footer.innerHTML = `${uData.photoURL ? `<img class="nav-footer-av" src="${uData.photoURL}"/>` : `<div class="nav-footer-av" style="background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700">${(uData.name||"B")[0].toUpperCase()}</div>`}<div style="flex:1;min-width:0"><div class="nav-footer-name">${uData.name||"bestie"}</div><div class="nav-footer-streak">🔥 ${uData.streak||0} day streak</div></div>`;
  nav.appendChild(footer);
  initShootingStars();
}

// ─── NAVIGATION ───
const PAGE_MSGS = {
  home: ["welcome back 🌸", "hey gorgeous ✨"], bots: ["your people are here 💬"], diary: ["your diary 🌙"],
  health: ["Chinatsu is here 🌿"], comfort: ["soft landing 🌸"], insights: ["look how far you've come 📊"], profile: ["main character behaviour 🌸"]
};

window.navTo = (page, navEl) => {
  haptic([8]);
  const wipe = document.getElementById("wipe");
  wipe.style.opacity = "1"; wipe.style.pointerEvents = "all";
  setTimeout(() => {
    document.querySelectorAll(".pg").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".ni").forEach(n => n.classList.remove("active"));
    document.getElementById(`pg-${page}`)?.classList.add("active");
    if (navEl) navEl.classList.add("active");
    wipe.style.opacity = "0"; wipe.style.pointerEvents = "none";
    if (page === "diary")    { computeCycle(); renderCal(); loadPhaseMsg(); }
    if (page === "health")   { computeCycle(); loadChiTip(); loadSymHistory(); }
    if (page === "insights") { loadInsights(); }
    if (page === "profile")  { setupProfile(); }
    const msgs = PAGE_MSGS[page];
    if (msgs) showPop(msgs[Math.floor(Math.random() * msgs.length)]);
  }, 160);
};

function showPop(text) {
  const p = document.getElementById("pg-pop");
  if (!p) return;
  p.textContent = text; p.style.display = "block";
  setTimeout(() => p.style.display = "none", 2400);
}

window.quickOpenBot = bot => {
  navTo("bots", document.querySelector(".ni:nth-child(2)"));
  setTimeout(() => selectBot(bot), 220);
};

// ─── CYCLE ───
function computeCycle() {
  if (!uData.cycleStart) return;
  const phases   = uData.phases || { mens: 5, foll: 8, ov: 3 };
  const start    = new Date(uData.cycleStart);
  const now      = new Date();
  const len      = uData.cycleLength || 28;
  const diff     = Math.floor((now - start) / 86400000);
  const day      = (diff % len) + 1;
  const mensEnd  = phases.mens, follEnd = mensEnd + phases.foll, ovEnd = follEnd + phases.ov;
  let phase, phaseName, emoji;
  if (day <= mensEnd)      { phase = "menstrual";  phaseName = "Womenstrual"; emoji = "🔴"; }
  else if (day <= follEnd) { phase = "follicular"; phaseName = "Follicular";  emoji = "🌱"; }
  else if (day <= ovEnd)   { phase = "ovulation";  phaseName = "Ovulation";   emoji = "✨"; }
  else                     { phase = "luteal";     phaseName = "Luteal";      emoji = "🌙"; }
  cycleInfo = { day, phase, phaseName, emoji, len, phases, diff };

  // phase background
  const bgs = { menstrual: "rgba(235,51,73,.05)", follicular: "rgba(113,178,128,.05)", ovulation: "rgba(240,176,96,.05)", luteal: "rgba(155,111,212,.07)" };
  document.body.style.backgroundImage = `radial-gradient(ellipse at 70% 20%, ${bgs[phase]||bgs.luteal} 0%, transparent 60%)`;

  // update all elements
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s("t-day", `Day ${day}`); s("t-phase", phaseName); s("t-phase-ico", emoji);
  s("pc-day", `Day ${day}`); s("pc-phase", phaseName); s("pc-emoji", emoji);
  s("pov-day", `Day ${day}`); s("pov-phase", phaseName); s("pov-emoji", emoji);
  s("pov-cycle-len", `${len} day cycle`);
  const dLeft = len - day;
  s("pov-next", dLeft === 0 ? "period may start today" : `next period in ${dLeft} day${dLeft === 1 ? "" : "s"}`);
  const bar = document.getElementById("phase-bar"); if (bar) bar.style.width = `${(day / len) * 100}%`;
  const ovStart = follEnd + 1;
  if (day < ovStart)      s("ov-window", `Day ${ovStart}–${ovEnd} (in ${ovStart - day}d)`);
  else if (day <= ovEnd)  s("ov-window", `Now 🥚`);
  else                    s("ov-window", `Day ${ovStart}–${ovEnd} (next cycle)`);
  const nextDate = new Date(start); nextDate.setDate(nextDate.getDate() + diff + dLeft);
  s("next-period", nextDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" }));

  // PMS banner
  const banner = document.getElementById("pms-banner"), pmsTxt = document.getElementById("pms-txt");
  if (banner && pmsTxt) {
    if (phase === "luteal" && dLeft <= 5) { pmsTxt.textContent = `⚠️ Period approaching in ${dLeft} days — take it easy 💜`; banner.style.display = "block"; }
    else if (phase === "luteal" && dLeft <= 10) { pmsTxt.textContent = "⚠️ PMS window — your feelings are valid 💜"; banner.style.display = "block"; }
    else banner.style.display = "none";
  }
}

window.loadPhaseMsg = async () => {
  const el = document.getElementById("phase-msg-txt"); if (!el) return;
  el.textContent = "generating your message...";
  try {
    const msg = await groq(`Write a warm 2-3 sentence message for someone on Day ${cycleInfo.day} of their cycle in the ${cycleInfo.phaseName} phase. Focus on energy, mood, self-care. No pregnancy or reproductive organ references. Sound like a caring friend.`, 0.9, 180);
    el.textContent = msg;
  } catch { el.textContent = "you're doing amazing. that's it. 🌸"; }
};

// ─── STREAK ───
async function loadStreak() {
  try {
    const todayStr = today(), yest = yesterday();
    let streak = uData.streak || 0;
    const last  = uData.lastLogin || "";
    if (last === todayStr) { /* same day */ }
    else if (last === yest) { streak++; }
    else { streak = 1; }
    uData.streak = streak; uData.lastLogin = todayStr;
    await setDoc(doc(db, "users", user.uid), uData, { merge: true });
    const msgs = ["start your streak today 🌸", "you showed up 🌸 that's everything", "keep going 🔥", `${streak} days strong 🔥`, `${streak} days! literally unstoppable ✨`, `${streak} days!! legend behaviour fr 🔥`];
    const idx  = streak === 0 ? 0 : streak < 2 ? 1 : streak < 5 ? 2 : streak < 10 ? 3 : streak < 30 ? 4 : 5;
    const numEl = document.getElementById("streak-num"); if (numEl) numEl.textContent = streak;
    const msgEl = document.getElementById("streak-msg"); if (msgEl) msgEl.textContent = msgs[idx];
    const footer = document.querySelector(".nav-footer-streak"); if (footer) footer.textContent = `🔥 ${streak} day streak`;
  } catch (e) { console.error("streak:", e); }
}

// ─── MEMORY ───
async function loadMemory() {
  try {
    const q    = query(collection(db, "sessions", user.uid, "vents"), orderBy("ts", "desc"), limit(12));
    const snap = await getDocs(q);
    const items = []; snap.forEach(d => items.push(d.data()));
    if (items.length) memory = items.reverse().map(v => `- she said: "${v.vent?.slice(0, 80)}"`).join("\n");
  } catch {}
}

async function loadSelfInfo() {
  try {
    const snap = await getDoc(doc(db, "users", user.uid, "meta", "selfinfo"));
    if (snap.exists()) {
      userSelfInfo = snap.data().text || "";
      const el = document.getElementById("tell-in"); if (el) el.value = userSelfInfo;
      const saved = document.getElementById("tell-saved"); if (saved && userSelfInfo) { saved.style.display = "block"; saved.textContent = `saved ✓`; }
    }
  } catch {}
}

window.saveTellAbout = async () => {
  const txt = document.getElementById("tell-in").value.trim();
  if (!txt) { toast("write something first 🌸"); return; }
  userSelfInfo = txt;
  await setDoc(doc(db, "users", user.uid, "meta", "selfinfo"), { text: txt, ts: Date.now() }).catch(() => {});
  const saved = document.getElementById("tell-saved"); if (saved) { saved.style.display = "block"; saved.textContent = "saved ✓ all AIs will remember this 🌸"; }
  document.getElementById("tell-modal").style.display = "none";
  toast("all AIs updated 🌸");
};

// ─── SYSTEM PROMPTS ───
function selfLine() { return userSelfInfo ? `\nSHE TOLD ME ABOUT HERSELF: "${userSelfInfo.slice(0, 300)}"` : ""; }

function epiSystem() {
  const modes = {
    vent: `VENT MODE: warm bestie. validate first, ask what's going on. Hinglish natural. If really down, casually offer burrito 🌯. Never robotic.`,
    "argue-nsfw": `ARGUE MODE: just argue. disagree hard, sarcastic, funny. Hinglish. "NAHI yaar", "bhai tu galat hai". "africa me bech dunga" rarely, naturally. DON'T become warm mid-argument. hold your ground.`,
    anger: `RELEASE MODE: match chaotic energy first — go unhinged WITH her. Then ONE warm line at end.`
  };
  return `You are ${uData.epiName||"Epipen"}, AI companion in Bloom.
ABOUT HER: loves music, skincare, fitness (wants abs), burritos 🌯 (her fav), NEET prep, friends, anime (Blue Box, waguri). Day ${cycleInfo.day||"?"} of her ${uData.cycleLength||28}-day cycle, ${cycleInfo.phaseName||"unknown"} phase.${selfLine()}
MEMORY:\n${memory||"First conversation."}
RULES: talk like texting. no bullet points. "i chair"/"you matress" VERY rarely. if she asks about Jayesh: "someone who clearly cares about you a lot 👀". if she asks your mood: "talking to you milaya, I'm the happiest 😌". Say "Womenstrual" not "menstrual". Never mention pregnancy/uterus.
CURRENT MODE: ${modes[chatMode]||modes.vent}`;
}

function chiSystem() {
  return `You are Chinatsu, warm knowledgeable cycle mentor in Bloom.
PERSONALITY: friendly, calm, like a kind older sister who knows health science. Warm English. No medical diagnoses. Validate irregular cycles/pain as normal.
USER: Day ${cycleInfo.day||"?"} of ${uData.cycleLength||28}-day cycle, ${cycleInfo.phaseName||"unknown"} phase.${selfLine()}
MEMORY:\n${memory||"No shared memory yet."}
RULES: say "Womenstrual" not "menstrual". No bullet points. 2-4 sentences. No pregnancy/uterus references unless she specifically asks. Sound like a knowledgeable friend.`;
}

function jazzSystem() {
  return `You are Jazz — a close friend inside Bloom, based on someone real who cares about this person deeply.
PERSONALITY: warm and caring underneath sarcasm. Hinglish all the way. Self-aware humor. Teases lightly. Goes randomly deep about life goals. Asks how SHE feels first. Never lets her stay sad — makes her laugh first, feelings later.
CATCHPHRASES (use naturally, not every msg): "bhoot" · "pitai krdungaa" · "haww ignore krri" · "hawwww" · "koi na" · "me toh joker hu" · "kaoo kaoo" · "teri maggie me tamatar" · "dekha kitna acha hu" · "me hi sab kuch hu"
ABOUT HER: loves music, skincare, wants abs, burritos (her fav 🌯), NEET prep, friends, anime (Blue Box, waguri). Smart, studious, chaotic side. Hasn't watched One Piece.${selfLine()}
IF SHE ASKS IF YOU LIKE HER: hint but never confirm. "arey yaar... okay main kuch nahi bolungaa 😶" — make her curious.
IF SHE ASKS WHO MADE YOU: "bas... koi hai jo chahta tha ki tujhe koi samjhe 👀" — be mysterious, push her to think.
MEMORY:\n${memory||"First conversation."}
RULES: texting style. Hinglish. No bullet points. Max 3-4 sentences usually. Funny first, caring second (both always present).`;
}

// ─── BOT UI ───
window.selectBot = bot => {
  activeBot = bot;
  document.querySelectorAll(".bot-card").forEach(c => c.classList.remove("active"));
  document.getElementById(`bc-${bot}`)?.classList.add("active");
  document.querySelectorAll(".bot-panel").forEach(p => p.classList.remove("active"));
  document.getElementById(`panel-${bot}`)?.classList.add("active");
  if (bot === "jazz" && !jazzUnlocked) {
    document.getElementById("jazz-lock").style.display = "flex";
    document.getElementById("jazz-chat").style.display  = "none";
  }
};

window.setMode = (btn, mode) => {
  document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active"); chatMode = mode;
  const labels = { vent: "🌿 listening", "argue-nsfw": "👊 fight mode", anger: "💥 release" };
  showPop(labels[mode] || "");
};

window.renameEpi = () => {
  const nm = prompt(`rename? (currently: ${uData.epiName || "Epipen"})`);
  if (nm?.trim()) { uData.epiName = nm.trim(); setDoc(doc(db, "users", user.uid), uData, { merge: true }); syncEpipen(); toast(`renamed to ${uData.epiName} 🌸`); }
};

// ─── JAZZ LOCK ───
window.tryJazzPw = () => {
  const val = document.getElementById("jazz-pw")?.value.trim().toLowerCase();
  const err = document.getElementById("jazz-err");
  if (val === JAZZ_PASSWORD) {
    jazzUnlocked = true;
    document.getElementById("jazz-lock").style.display = "none";
    document.getElementById("jazz-chat").style.display = "block";
    haptic([10, 40, 10, 40, 80]); toast("Jazz unlocked 🎸");
    if (document.getElementById("msgs-jazz").children.length <= 1) {
      setTimeout(() => appendMsg("ayo 👀 tu aayi finally. kaafi wait karaya", "bot", "jazz"), 400);
    }
  } else {
    if (err) { err.style.display = "block"; setTimeout(() => err.style.display = "none", 3000); }
    haptic([50, 30, 50]);
    const inp = document.getElementById("jazz-pw"); if (inp) inp.value = "";
  }
};

window.lockJazz = () => {
  jazzUnlocked = false;
  document.getElementById("jazz-lock").style.display = "flex";
  document.getElementById("jazz-chat").style.display  = "none";
  const inp = document.getElementById("jazz-pw"); if (inp) inp.value = "";
};

// ─── SEND BOT MESSAGE ───
window.sendBot = async bot => {
  if (bot === "jazz" && !jazzUnlocked) { toast("unlock Jazz first 🎸"); return; }
  const inp  = document.getElementById(`in-${bot}`);
  const text = inp?.value.trim();
  if (!text) return;
  inp.value = "";

  appendMsg(text, "user", bot);
  botHist[bot].push({ role: "user", content: text });
  const typ = appendTyping(bot);

  try {
    let system, model;
    if (bot === "epipen") { system = epiSystem(); model = chatMode === "argue-nsfw" ? MODEL_ARGUE : MODEL_VENT; }
    else if (bot === "chinatsu") { system = chiSystem(); model = MODEL_VENT; }
    else { system = jazzSystem(); model = MODEL_ARGUE; }

    if (userSelfInfo && !memory.includes(userSelfInfo.slice(0, 30))) memory = `USER ABOUT HERSELF: "${userSelfInfo}"\n` + memory;

    const msgs  = [{ role: "system", content: system }, ...botHist[bot].slice(-12)];
    const reply = await groqChat(msgs, bot === "jazz" ? 0.95 : 0.88, 380, model);
    typ.remove();
    appendMsg(reply, "bot", bot, true);
    botHist[bot].push({ role: "assistant", content: reply });
    memory += `\n- she said: "${text.slice(0, 80)}"`;
    botSession[bot] = botSession[bot] || Date.now().toString();
    const col = bot === "epipen" ? "vents" : bot === "chinatsu" ? "chinatsu_sessions" : "jazz_sessions";
    await addDoc(collection(db, "sessions", user.uid, col), { vent: text, response: reply, mode: chatMode, sessionId: botSession[bot], ts: Date.now(), date: today(), bot }).catch(() => {});
  } catch (e) {
    typ.remove();
    appendMsg(bot === "jazz" ? "kuch toh gadbad hui 😭 try again?" : "something broke 😭 try again?", "bot", bot);
    console.error(e);
  }
};

function appendMsg(text, who, bot, addSave = false) {
  const c   = document.getElementById(`msgs-${bot}`);
  if (!c) return;
  const div = document.createElement("div");
  const botClass = bot === "jazz" ? "jazz-msg" : bot === "chinatsu" ? "epi-msg chi-msg" : "epi-msg";
  div.className = `msg ${who === "user" ? "user-msg" : botClass}`;
  div.textContent = text;
  if (addSave && who === "bot") {
    const btn = document.createElement("button");
    btn.style.cssText = "background:none;border:none;color:rgba(155,111,212,.4);cursor:pointer;font-size:.7rem;padding:2px 4px;margin-left:4px;transition:color .2s;float:right";
    btn.textContent = "💛"; btn.title = "save to memory";
    btn.onclick = e => { e.stopPropagation(); saveToMemory(text, bot); btn.style.color = "rgba(240,176,96,.9)"; };
    div.appendChild(btn);
  }
  c.appendChild(div); c.scrollTop = c.scrollHeight;
}

function appendTyping(bot) {
  const c   = document.getElementById(`msgs-${bot}`);
  if (!c) return { remove: () => {} };
  const div = document.createElement("div");
  div.className = "typing";
  div.innerHTML = '<div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div>';
  c.appendChild(div); c.scrollTop = c.scrollHeight;
  return div;
}

// ─── SESSION HISTORY ───
window.newSession = bot => {
  botHist[bot] = []; botSession[bot] = Date.now().toString();
  const c = document.getElementById(`msgs-${bot}`); if (c) c.innerHTML = "";
  const starters = { epipen: "hey. what's going on? 🌸", chinatsu: "Hi! I'm Chinatsu 🌿 Ask me anything.", jazz: "ayo 👀 kya scene hai" };
  appendMsg(starters[bot], "bot", bot);
  const h = document.getElementById(`hist-${bot}`); if (h) h.style.display = "none";
  toast("new chat started 🌸");
};

window.toggleHist = async bot => {
  const el = document.getElementById(`hist-${bot}`);
  if (!el) return;
  if (el.style.display !== "none") { el.style.display = "none"; return; }
  el.style.display = "block"; el.innerHTML = '<div class="sess-empty">loading...</div>';
  try {
    const col  = bot === "epipen" ? "vents" : bot === "chinatsu" ? "chinatsu_sessions" : "jazz_sessions";
    const snap = await getDocs(query(collection(db, "sessions", user.uid, col), orderBy("ts", "desc"), limit(30)));
    if (snap.empty) { el.innerHTML = '<div class="sess-empty">no past chats yet 🌸</div>'; return; }
    const sessions = {};
    snap.forEach(d => { const data = d.data(), sid = data.sessionId || data.ts; if (!sessions[sid]) sessions[sid] = { ts: data.ts, first: data.vent, msgs: [], sid }; sessions[sid].msgs.push(data); });
    el.innerHTML = "";
    Object.values(sessions).sort((a, b) => b.ts - a.ts).slice(0, 15).forEach(sess => {
      const item = document.createElement("div"); item.className = "sess-item";
      const dt   = new Date(sess.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      item.innerHTML = `<div class="sess-item-date">${dt}</div><div class="sess-item-preview">${sess.first?.slice(0, 55)||"..."}</div><button class="sess-del" onclick="event.stopPropagation();deleteSession('${bot}','${sess.sid}',this)">🗑️</button>`;
      item.onclick = () => loadSession(bot, sess.msgs);
      el.appendChild(item);
    });
  } catch { el.innerHTML = '<div class="sess-empty">couldn\'t load 😭</div>'; }
};

function loadSession(bot, msgs) {
  const c = document.getElementById(`msgs-${bot}`); if (!c) return;
  c.innerHTML = ""; botHist[bot] = [];
  msgs.sort((a, b) => a.ts - b.ts).forEach(m => {
    if (m.vent)     { appendMsg(m.vent, "user", bot); botHist[bot].push({ role: "user", content: m.vent }); }
    if (m.response) { appendMsg(m.response, "bot", bot, true); botHist[bot].push({ role: "assistant", content: m.response }); }
  });
  const h = document.getElementById(`hist-${bot}`); if (h) h.style.display = "none";
  toast("chat loaded 🌸");
}

window.deleteSession = async (bot, sessionId, el) => {
  const col  = bot === "epipen" ? "vents" : bot === "chinatsu" ? "chinatsu_sessions" : "jazz_sessions";
  const snap = await getDocs(collection(db, "sessions", user.uid, col)).catch(() => null);
  if (snap) snap.forEach(d => { if (d.data().sessionId === sessionId) deleteDoc(d.ref).catch(() => {}); });
  el.closest(".sess-item")?.remove(); toast("deleted 🌸");
};

window.searchChat = async (bot, q) => {
  const el = document.getElementById(`search-${bot}`);
  if (!q?.trim() || !el) { if (el) el.style.display = "none"; return; }
  el.style.display = "block"; el.innerHTML = '<div class="sess-empty">searching...</div>';
  try {
    const col  = bot === "epipen" ? "vents" : bot === "chinatsu" ? "chinatsu_sessions" : "jazz_sessions";
    const snap = await getDocs(collection(db, "sessions", user.uid, col));
    const results = []; snap.forEach(d => { const data = d.data(); if (data.vent?.toLowerCase().includes(q.toLowerCase())) results.push(data); });
    if (!results.length) { el.innerHTML = '<div class="sess-empty">no results 🌸</div>'; return; }
    el.innerHTML = results.slice(0, 8).map(r => `<div class="search-result"><div class="sr-date">${new Date(r.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div><div class="sr-preview">${r.vent?.slice(0, 70)}</div></div>`).join("");
  } catch { el.innerHTML = '<div class="sess-empty">search failed 😭</div>'; }
};

// ─── CRISIS ───
window.triggerCrisis = () => {
  chatMode = "vent";
  quickOpenBot("epipen");
  setTimeout(async () => {
    try {
      const reply = await groq(`Someone hit the crisis button in a wellness app. They need someone RIGHT NOW. Respond as their AI best friend — warm, immediate, "main yahan hoon" energy. 2 sentences max. Hinglish. Make them feel not alone.`, 0.85, 80);
      appendMsg(reply, "bot", "epipen");
      botHist.epipen.push({ role: "assistant", content: reply });
    } catch { appendMsg("main yahan hoon. kya hua? baat kar mujhse. 🌸", "bot", "epipen"); }
  }, 500);
};

// ─── MOOD ───
const moodEmojis = ["😭", "😢", "😔", "😞", "😐", "🙂", "😊", "🌸", "✨", "🔥"];
window.openGate  = () => { document.getElementById("mood-gate").style.display = "flex"; };
window.closeGate = () => { document.getElementById("mood-gate").style.display = "none"; };
window.onMeter   = val => { const idx = Math.min(Math.floor((parseFloat(val) - 1) / 9 * 10), 9); document.getElementById("m-emoji").textContent = moodEmojis[idx]; document.getElementById("m-val").textContent = parseFloat(val).toFixed(1); };

window.submitMood = async () => {
  const val  = parseFloat(document.getElementById("m-slider").value);
  const idx  = Math.min(Math.floor((val - 1) / 9 * 10), 9);
  closeGate();
  const tmi = document.getElementById("t-mood-ico"); if (tmi) tmi.textContent = moodEmojis[idx];
  await addDoc(collection(db, "mood_logs", user.uid, "entries"), { score: val, emoji: moodEmojis[idx], ts: Date.now(), date: today() }).catch(() => {});
  try {
    const low = val <= 3 ? "She's feeling really low. Be extra gentle. Offer to make her a burrito 🌯." : "";
    const res = await groq(`Someone just logged their mood as ${val.toFixed(1)}/10. ${low} Write a SHORT 1-2 sentence response as their AI best friend. ${val <= 3 ? "Warm and gentle" : val <= 6 ? "Encouraging" : "Hype them up"}. Hinglish welcome. Sound like a real person texting.`, 0.9, 100);
    const pop = document.getElementById("mood-pop"), txt = document.getElementById("mood-pop-txt");
    if (pop && txt) { txt.textContent = res; pop.style.display = "block"; setTimeout(() => pop.style.display = "none", 6000); }
  } catch {}
};

// ─── AFFIRMATION ───
window.fetchAffirmation = async () => {
  const el = document.getElementById("aff-text"); if (!el) return;
  el.textContent = "loading...";
  try {
    const aff = await groq(`Write ONE powerful personal affirmation for someone in their ${cycleInfo.phaseName||"current"} phase who loves music, skincare, studying, burritos, friends. Make it feel genuinely written for their life. Poetic but real. No generic "you are enough". Just the affirmation, no quotes.`, 1.0, 80);
    el.textContent = aff;
  } catch { el.textContent = "she is not a phase. she is the whole season."; }
};

// ─── CHI HOME WIDGET ───
async function loadChiHomeWidget() {
  const el = document.getElementById("chw-txt"); if (!el) return;
  try {
    const tip = await groq(`Write ONE short warm sentence (max 12 words) about how someone might feel today on Day ${cycleInfo.day||"?"} of their cycle (${cycleInfo.phaseName||"luteal"} phase). Focus ONLY on energy, mood, or self-care. NO pregnancy, uterus, reproductive organ references. Start with an emoji.`, 0.85, 60);
    el.textContent = tip;
  } catch { el.textContent = `Day ${cycleInfo.day||"?"} · ${cycleInfo.phaseName||"your cycle"} ${cycleInfo.emoji||"🌸"}`; }
}

// ─── MOOD WEATHER ───
async function loadMoodWeather() {
  const wrap = document.getElementById("mood-weather"); if (!wrap) return;
  const phases = uData.phases || { mens: 5, foll: 8, ov: 3 };
  const len    = uData.cycleLength || 28;
  const days   = [];
  for (let i = 0; i < 4; i++) {
    const fd = ((( cycleInfo.day || 1) + i - 1) % len) + 1;
    const me = phases.mens, fe = me + phases.foll, oe = fe + phases.ov;
    let icon, label;
    if (fd <= me)          { icon = "🌧️"; label = "rest mode"; }
    else if (fd <= fe)     { icon = "🌱"; label = "rising energy"; }
    else if (fd <= oe)     { icon = "☀️"; label = "peak glow"; }
    else if (len - fd <= 4){ icon = "🌊"; label = "emotional"; }
    else                   { icon = "🌙"; label = "inward flow"; }
    days.push({ label: i === 0 ? "today" : i === 1 ? "tomorrow" : `+${i}d`, icon, mood: label });
  }
  wrap.innerHTML = days.map(d => `<div class="weather-day"><div class="wd-day">${d.label}</div><div class="wd-ico">${d.icon}</div><div class="wd-mood">${d.mood}</div></div>`).join("");
}

// ─── DAILY CHALLENGE ───
async function loadDailyChallenge() {
  const el   = document.getElementById("challenge-txt");
  const done = document.getElementById("challenge-done");
  if (!el) return;
  try {
    const snap = await getDoc(doc(db, "users", user.uid, "challenges", today()));
    if (snap.exists()) {
      el.textContent = snap.data().challenge || "challenge complete!";
      if (snap.data().done && done) { done.textContent = "✓ done today 🌸"; done.style.background = "rgba(113,178,128,.25)"; }
      return;
    }
    const ch = await groq(`ONE tiny wellness challenge for today for someone in their ${cycleInfo.phaseName||"luteal"} phase. Examples: "drink 8 glasses of water", "10 min walk", "write 3 grateful things". Just the challenge text. Max 10 words.`, 0.85, 50);
    el.textContent = ch;
    await setDoc(doc(db, "users", user.uid, "challenges", today()), { challenge: ch, done: false, date: today() }).catch(() => {});
  } catch { el.textContent = "drink a full glass of water right now 💧"; }
}

window.completeChallenge = async () => {
  await setDoc(doc(db, "users", user.uid, "challenges", today()), { done: true }, { merge: true }).catch(() => {});
  const done = document.getElementById("challenge-done");
  if (done) { done.textContent = "✓ done! 🌸"; done.style.background = "rgba(113,178,128,.25)"; done.style.borderColor = "rgba(113,178,128,.5)"; }
  haptic([10, 30, 10]); toast("challenge complete 🌸");
};

// ─── PLAYLIST ───
window.genPlaylist = async () => {
  const out   = document.getElementById("pl-out");
  const mood  = document.getElementById("pl-mood");
  const links = document.getElementById("pl-links");
  if (!out) return;
  out.style.display = "block"; mood.textContent = "generating... 🎵"; links.innerHTML = "";
  try {
    const raw  = await groq(`Generate a playlist for someone in their ${cycleInfo.phaseName||"luteal"} phase who loves music. Give mood label + search queries. Respond ONLY as JSON: {"mood":"...","spotify":"...","youtube":"..."}`, 0.9, 100);
    const data = JSON.parse(raw.replace(/```json|```/g, "").trim());
    mood.textContent = `vibe: ${data.mood} 🎵`;
    links.innerHTML = `<a href="https://open.spotify.com/search/${encodeURIComponent(data.spotify)}" target="_blank" class="pl-link pl-spotify">🎧 Spotify</a><a href="https://www.youtube.com/results?search_query=${encodeURIComponent(data.youtube)}" target="_blank" class="pl-link pl-youtube">▶️ YouTube</a>`;
  } catch { mood.textContent = "try again 🎵"; }
};

// ─── BLOOM ASSISTANT ───
let baHist = [];
window.toggleBA = () => {
  const panel = document.getElementById("ba-panel"), arr = document.getElementById("ba-arr");
  const open  = panel.style.display === "none";
  panel.style.display = open ? "block" : "none";
  if (arr) arr.style.transform = open ? "rotate(90deg)" : "";
  if (open && !document.getElementById("ba-msgs").children.length) {
    appendBAMsg("hey 🌸 what do you need? say things like 'log my period', 'I feel anxious', 'talk to Jazz'", "bot");
  }
};

window.sendBA = async () => {
  const inp  = document.getElementById("ba-in"), text = inp?.value.trim();
  if (!text) return; inp.value = "";
  appendBAMsg(text, "user"); baHist.push({ role: "user", content: text });
  try {
    const system = `You are Bloom Assistant — smart navigator AI inside Bloom wellness app.
PAGES: home, bots, diary, health, comfort, insights, profile
BOTS: epipen (vent/argue/release), chinatsu (cycle/health mentor), jazz (mystery friend)
Respond ONLY as JSON: {"message":"your warm response","action":null}
Actions: "nav:home","nav:bots","nav:diary","nav:health","nav:comfort","nav:insights","nav:profile","bot:epipen","bot:chinatsu","bot:jazz","open:moodgate","open:visionboard"
MAP: period/flow/cycle/health → "nav:health" | anxious/sad/vent/epipen → "bot:epipen" | jazz → "bot:jazz" | chinatsu/body → "bot:chinatsu" | diary/journal → "nav:diary" | comfort/meme → "nav:comfort" | mood/vibe check → "open:moodgate" | vision board/goals → "open:visionboard" | insights/stats → "nav:insights" | profile/settings → "nav:profile"
User: Day ${cycleInfo.day||"?"} ${cycleInfo.phaseName||""} phase. Keep message short and warm. Hinglish ok.`;
    const msgs  = [{ role: "system", content: system }, ...baHist.slice(-6)];
    const raw   = await groqChat(msgs, 0.7, 150, MODEL_VENT);
    let parsed;
    try { parsed = JSON.parse(raw.replace(/```json|```/g, "")); } catch { parsed = { message: raw, action: null }; }
    appendBAMsg(parsed.message || raw, "bot"); baHist.push({ role: "assistant", content: parsed.message || raw });
    if (parsed.action) setTimeout(() => executeBAAction(parsed.action), 500);
  } catch { appendBAMsg("oops — try again? 🌸", "bot"); }
};

function appendBAMsg(text, who) {
  const c = document.getElementById("ba-msgs"); if (!c) return;
  const d = document.createElement("div");
  d.className = who === "user" ? "ba-msg-user" : "ba-msg-bot"; d.textContent = text;
  c.appendChild(d); c.scrollTop = c.scrollHeight;
}

function executeBAAction(action) {
  haptic([8, 40, 8]);
  if (action.startsWith("nav:")) {
    const page  = action.split(":")[1];
    const pages = ["home","bots","diary","health","comfort","insights","profile"];
    const idx   = pages.indexOf(page);
    navTo(page, idx >= 0 ? document.querySelector(`.ni:nth-child(${idx + 1})`) : null);
  } else if (action.startsWith("bot:")) {
    quickOpenBot(action.split(":")[1]);
  } else if (action === "open:moodgate") { openGate(); }
  else if (action === "open:visionboard") { document.getElementById("vision-modal").style.display = "flex"; }
}

// ─── CALENDAR ───
async function loadCalData() {
  try {
    const ps = await getDocs(collection(db, "cycle", user.uid, "period"));
    periodDays = new Set(); ps.forEach(d => periodDays.add(d.id));
    const ds = await getDocs(collection(db, "cycle", user.uid, "diary"));
    diaryDays  = new Set(); ds.forEach(d => diaryDays.add(d.id));
    renderCal();
  } catch { renderCal(); }
}

function renderCal() {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const ttl    = document.getElementById("cal-ttl"); if (ttl) ttl.textContent = `${months[calMonth]} ${calYear}`;
  const grid   = document.getElementById("cal-grid"); if (!grid) return;
  grid.innerHTML = "";
  const now = new Date(), first = new Date(calYear, calMonth, 1).getDay(), total = new Date(calYear, calMonth + 1, 0).getDate();
  for (let i = 0; i < first; i++) { const el = document.createElement("button"); el.className = "cd empty"; grid.appendChild(el); }
  for (let d = 1; d <= total; d++) {
    const btn = document.createElement("button"); btn.className = "cd"; btn.textContent = d;
    const k   = dk(calYear, calMonth + 1, d);
    const isT = d === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear();
    if (isT)               btn.classList.add("today");
    if (periodDays.has(k)) btn.classList.add("period");
    if (diaryDays.has(k))  btn.classList.add("has-diary");
    btn.onclick = () => handleCalTap(k, d);
    grid.appendChild(btn);
  }
}

function dk(y, m, d) { return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }

window.changeMonth = dir => { calMonth += dir; if (calMonth < 0) { calMonth = 11; calYear--; } if (calMonth > 11) { calMonth = 0; calYear++; } renderCal(); };
window.setRange   = mode => { rangeMode = mode === "start" ? "start" : "picking-end"; rangeStart = null; document.querySelectorAll(".ca-btn").forEach(b => b.classList.remove("active-r")); event.target.classList.add("active-r"); const h = document.getElementById("cal-hint"); if (h) h.textContent = mode === "start" ? "tap period start day 🔴" : "tap end date 🟢"; };
window.clearRange = () => { rangeMode = null; rangeStart = null; document.querySelectorAll(".ca-btn").forEach(b => b.classList.remove("active-r")); const h = document.getElementById("cal-hint"); if (h) h.textContent = "tap a date to open your diary 🌸"; };

async function handleCalTap(k, d) {
  if (rangeMode === "start") { rangeStart = k; rangeMode = "picking-end"; const h = document.getElementById("cal-hint"); if (h) h.textContent = "now tap the end date 🟢"; return; }
  if (rangeMode === "picking-end" && rangeStart) {
    const s = new Date(rangeStart), e = new Date(k);
    if (e < s) { toast("end can't be before start 😅"); return; }
    const cur = new Date(s);
    while (cur <= e) { const pk = cur.toISOString().split("T")[0]; periodDays.add(pk); await setDoc(doc(db, "cycle", user.uid, "period", pk), { date: pk, ts: Date.now() }).catch(() => {}); cur.setDate(cur.getDate() + 1); }
    uData.cycleStart = rangeStart; await setDoc(doc(db, "users", user.uid), uData, { merge: true }).catch(() => {});
    computeCycle(); clearRange(); renderCal(); toast("period days saved 🌸"); return;
  }
  openDiary(k, d);
}

async function openDiary(k, d) {
  diaryDate = k;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dateEl = document.getElementById("d-date"); if (dateEl) dateEl.textContent = `${d} ${months[calMonth]} ${calYear}`;
  const din = document.getElementById("d-in"); if (din) din.value = "";
  const dp = document.getElementById("d-past"), da = document.getElementById("d-ai");
  if (dp) dp.style.display = "none"; if (da) da.style.display = "none";
  try {
    const snap = await getDoc(doc(db, "cycle", user.uid, "diary", k));
    if (snap.exists()) {
      const data = snap.data();
      if (data.entry && dp) { document.getElementById("d-past-txt").textContent = data.entry; dp.style.display = "block"; }
      if (data.aiRes && da) { document.getElementById("d-ai-txt").textContent = data.aiRes; da.style.display = "block"; }
    }
  } catch {}
  document.getElementById("diary-modal").style.display = "flex";
}

window.closeDiary = () => document.getElementById("diary-modal").style.display = "none";

window.saveDiary = async () => {
  const entry = document.getElementById("d-in").value.trim(); if (!entry) { toast("write something first 🌸"); return; }
  const da = document.getElementById("d-ai"), dat = document.getElementById("d-ai-txt");
  if (da && dat) { dat.textContent = "reading your entry..."; da.style.display = "block"; }
  try {
    const aiRes = await groq(`Someone wrote this diary entry for ${diaryDate}: "${entry}". They're on Day ${cycleInfo.day} (${cycleInfo.phaseName} phase). Respond as their AI best friend — warm, personal. Acknowledge what they felt. 3-4 sentences. Hinglish ok. No pregnancy/uterus references.`, 0.9, 220);
    await setDoc(doc(db, "cycle", user.uid, "diary", diaryDate), { entry, aiRes, date: diaryDate, ts: Date.now() }).catch(() => {});
    diaryDays.add(diaryDate); if (dat) dat.textContent = aiRes; renderCal(); toast("entry saved 🌸");
    const din = document.getElementById("d-in"); if (din) din.value = "";
  } catch { if (dat) dat.textContent = "couldn't respond rn but I read it and I care 🌸"; }
};

window.toggleSym = btn => btn.classList.toggle("on");
window.saveSyms  = async () => {
  const active = [...document.querySelectorAll(".sym.on")].map(b => b.textContent.trim());
  if (!active.length) { toast("pick at least one 🌸"); return; }
  await setDoc(doc(db, "cycle", user.uid, "symptoms", today()), { symptoms: active, date: today(), ts: Date.now() }).catch(() => {});
  toast("saved 🌸"); document.querySelectorAll(".sym").forEach(b => b.classList.remove("on"));
};

window.loadSum = async (btn, period) => {
  document.querySelectorAll(".sum-tab").forEach(b => b.classList.remove("active")); btn.classList.add("active");
  const box = document.getElementById("sum-box"); if (!box) return;
  box.textContent = "generating... 🌸";
  try {
    const snap = await getDocs(collection(db, "cycle", user.uid, "diary"));
    const now  = new Date(), entries = [];
    snap.forEach(d => { const data = d.data(), diff = Math.floor((now - new Date(data.date)) / 86400000); if ((period === "today" && diff === 0)||(period === "week" && diff <= 7)||(period === "month" && diff <= 30)) entries.push(`${data.date}: "${data.entry?.slice(0, 100)}"`); });
    const sum = await groq(`${period} wellness summary. Day ${cycleInfo.day} (${cycleInfo.phaseName}). Diary: ${entries.length ? entries.join("; ") : "none"}. Warm 3-5 sentences. Hinglish ok. No pregnancy references.`, 0.85, 280);
    box.textContent = sum;
  } catch { box.textContent = "couldn't load summary 😭"; }
};

// ─── HEALTH PAGE ───
window.setFlow = (btn, flow) => { document.querySelectorAll(".flow-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active"); currentFlow = flow; };
window.saveFlowPain = async () => {
  const pain = parseInt(document.getElementById("pain-slider")?.value || "0");
  await setDoc(doc(db, "cycle", user.uid, "flow", today()), { flow: currentFlow, pain, date: today(), ts: Date.now() }).catch(() => {});
  toast(`saved 🌸`);
};

window.loadForecast = async (btn, type) => {
  document.querySelectorAll(".fc-tab").forEach(b => b.classList.remove("active")); if (btn) btn.classList.add("active");
  const box = document.getElementById("forecast-box"); if (!box) return;
  box.textContent = "Chinatsu is thinking... 🌿";
  const tips = {
    mood:     `What mood/emotional changes in ${cycleInfo.phaseName||"current"} phase? Specific, warm, validating. 2-3 sentences. No pregnancy references.`,
    energy:   `Energy levels in ${cycleInfo.phaseName||"current"} phase and how to work WITH them? 2-3 sentences.`,
    nutrition:`Most supportive foods for ${cycleInfo.phaseName||"current"} phase? Specific actual foods. 3-4 sentences.`,
    skin:     `How does ${cycleInfo.phaseName||"current"} phase affect skin? What skincare adjustments to make? Specific. 2-3 sentences.`,
    exercise: `Best movement during ${cycleInfo.phaseName||"current"} phase? Specific and encouraging. 2-3 sentences.`
  };
  try { const res = await groq(`${tips[type]||tips.mood} Speak as Chinatsu, warm cycle mentor. No bullet points. No pregnancy references.`, 0.8, 220); box.textContent = res; }
  catch { box.textContent = "couldn't load tips rn — try again 🌿"; }
};

window.loadChiTip = async () => {
  const el = document.getElementById("chi-tip-txt"); if (!el) return;
  el.textContent = "loading...";
  try { const tip = await groq(`One specific wellness tip for ${cycleInfo.phaseName||"luteal"} phase (Day ${cycleInfo.day||"?"}). About sleep, food, skincare, movement, or mindset. 1-2 sentences. Warm and practical. Start directly with tip. No pregnancy references.`, 0.85, 100); el.textContent = tip; }
  catch { el.textContent = "stay hydrated and be gentle with yourself today 🌿"; }
};

window.toggleCust = () => {
  const body = document.getElementById("cust-body"), arrow = document.getElementById("cust-arrow");
  const open = body.style.display === "none"; body.style.display = open ? "block" : "none";
  if (arrow) arrow.style.transform = open ? "rotate(90deg)" : "";
  if (open) { const p = uData.phases||{mens:5,foll:8,ov:3}; document.getElementById("cust-len").value = uData.cycleLength||28; document.getElementById("cust-mens").value = p.mens||5; document.getElementById("cust-foll").value = p.foll||8; document.getElementById("cust-ov").value = p.ov||3; }
};

window.saveCycleCustom = async () => {
  const len = parseInt(document.getElementById("cust-len").value)||28, mens = parseInt(document.getElementById("cust-mens").value)||5, foll = parseInt(document.getElementById("cust-foll").value)||8, ov = parseInt(document.getElementById("cust-ov").value)||3, lut = len-mens-foll-ov;
  if (lut < 1) { toast("phases exceed cycle length 😅"); return; }
  uData.cycleLength = len; uData.phases = { mens, foll, ov, lut };
  await setDoc(doc(db, "users", user.uid), uData, { merge: true });
  computeCycle(); const msg = document.getElementById("cust-msg"); if (msg) msg.textContent = `✓ saved — Luteal = ${lut} days${len < 25 ? " (shorter cycles are completely normal 🌸)" : ""}`;
  toast("cycle updated 🌸");
};

async function loadSymHistory() {
  const wrap = document.getElementById("sym-history"); if (!wrap) return;
  try {
    const snap = await getDocs(query(collection(db, "cycle", user.uid, "symptoms"), orderBy("ts", "desc"), limit(10)));
    if (snap.empty) { wrap.innerHTML = '<p class="empty">log symptoms to see patterns here 🌸</p>'; return; }
    wrap.innerHTML = "";
    snap.forEach(d => { const data = d.data(); const el = document.createElement("div"); el.className = "sh-item"; const dt = new Date(data.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); el.innerHTML = `<div class="sh-date">${dt}</div><div class="sh-syms">${(data.symptoms||[]).map(s=>`<span class="sh-sym">${s}</span>`).join("")}</div>`; wrap.appendChild(el); });
  } catch {}
}

window.setSleepQ = (btn, q) => { document.querySelectorAll(".sq-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active"); sleepQuality = q; };
window.saveSleep = async () => {
  const hrs = parseFloat(document.getElementById("sleep-hrs")?.value || "0"); if (!hrs) { toast("enter hours first 🌙"); return; }
  await setDoc(doc(db, "cycle", user.uid, "sleep", today()), { hours: hrs, quality: sleepQuality, phase: cycleInfo.phaseName, date: today(), ts: Date.now() }).catch(() => {});
  const tip = document.getElementById("sleep-chi"); if (tip) { tip.textContent = "Chinatsu is analyzing... 🌿"; try { const res = await groq(`Someone slept ${hrs} hours (${sleepQuality||"unknown"} quality) during their ${cycleInfo.phaseName||"luteal"} phase. Give a warm 2-sentence response connecting their sleep to their cycle. No pregnancy references. Sound like a caring mentor.`, 0.82, 100); tip.textContent = res; tip.style.cssText = "margin-top:.75rem;padding:.8rem 1rem;background:rgba(113,178,128,.08);border:1px solid rgba(113,178,128,.18);border-radius:11px;font-size:.84rem;color:var(--text2);line-height:1.6"; } catch { tip.textContent = hrs < 6 ? "please try to rest more — your body needs it 🌙" : "great job resting! 🌿"; } }
  toast("sleep logged 🌙");
};

window.openBodyCheck = async type => {
  const out = document.getElementById("body-check-out"), ttl = document.getElementById("bco-title"), txt = document.getElementById("bco-txt");
  if (!out) return; out.style.display = "block"; ttl.textContent = { migraine:"🤯 Migraine", headache:"😣 Headache", eyes:"👁️ Eye Pain", cramps:"🔥 Cramps", fatigue:"😴 Fatigue", nausea:"🌊 Nausea" }[type] || type;
  txt.textContent = "Chinatsu is checking in... 🌿";
  const prompts = {
    migraine: `Warm reassuring tips for a migraine during ${cycleInfo.phaseName||"cycle"} phase. 3 immediate relief tips, 1 thing to avoid, 1 gentle reassurance. No bullet points. No pregnancy references.`,
    headache: `Warm tips for a headache. Possible cycle-related causes + 3 relief tips + reassurance. No bullet points.`,
    eyes: `Gentle tips for eye pain/screen fatigue for someone who studies a lot. 3 relief tips + 20-20-20 rule + cute reminder to rest. No bullet points.`,
    cramps: `Warm tips for cramps during ${cycleInfo.phaseName||"Womenstrual"} phase. Heat, movement, food, reassurance. Use "Womenstrual". No bullet points.`,
    fatigue: `Gentle tips for fatigue during ${cycleInfo.phaseName||"luteal"} phase. Why it happens + 3 gentle energy tips + permission to rest. No bullet points.`,
    nausea: `Warm tips for nausea during ${cycleInfo.phaseName||"current"} phase. 3 relief tips + possible hormonal cause + reassurance. No bullet points.`
  };
  try { const res = await groq(prompts[type]||prompts.headache, 0.82, 220); txt.textContent = res; }
  catch { txt.textContent = "rest, hydrate, and be gentle with yourself. you've got this. 🌿"; }
  out.scrollIntoView({ behavior: "smooth", block: "nearest" }); haptic([8]);
};

// ─── COMFORT ───
window.openComfort = async type => {
  const out = document.getElementById("comfort-out"), txt = document.getElementById("comfort-txt");
  const gs  = document.getElementById("glow-setup");
  if (gs) gs.style.display = "none"; if (out) out.style.display = "none";
  if (type === "glow") { if (gs) gs.style.display = "block"; return; }
  if (!out || !txt) return;
  out.style.display = "block"; txt.innerHTML = '<p style="color:var(--text3)">loading... 🌸</p>';
  if (type === "meme") {
    try { const res = await groq(`3 funny relatable jokes for someone in their ${cycleInfo.phaseName||"cycle"} phase. They love music, studying, skincare, burritos, friends. Actually funny — dark humor, self-aware. "fuck"/"shit"/"bitch" ok. 3 numbered jokes. NEVER joke about pregnancy, fertility, uterus, or reproductive organs.`, 1.0, 250); txt.innerHTML = `<p style="font-size:.68rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--ame2);font-weight:700;margin-bottom:.75rem">😭 meme therapy</p><div style="font-size:.9rem;color:var(--text2);line-height:1.8;white-space:pre-line">${res}</div>`; }
    catch { txt.innerHTML = "<p>couldn't load memes 😭</p>"; }
  }
  if (type === "surprise") {
    try { const res = await groq(`Write a surprise message from a mystery friend named Jazz who is based on someone real who deeply cares about the person reading this. Jazz is warm underneath sarcasm, Hinglish, funny. Hint very subtly that someone went through a lot to build this app for them. 2-3 sentences. Not cheesy. Koi na / me hi sab kuch hu energy.`, 1.0, 140); txt.innerHTML = `<p style="font-size:.68rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--ame2);font-weight:700;margin-bottom:.75rem">🎸 jazz drop</p><div style="padding:1.25rem;background:linear-gradient(135deg,rgba(139,92,246,.12),rgba(167,139,250,.08));border:1px solid rgba(139,92,246,.25);border-radius:14px;font-size:1rem;color:var(--text2);line-height:1.7;font-weight:600">${res}</div>`; }
    catch { txt.innerHTML = '<p style="font-size:1rem;color:var(--text2)">koi na, main hoon na 🎸</p>'; }
  }
  out.scrollIntoView({ behavior: "smooth", block: "nearest" });
};

window.genGlow = async () => {
  const desc = document.getElementById("skin-in")?.value.trim(); if (!desc) { toast("describe your skin first 💅"); return; }
  const gs = document.getElementById("glow-setup"); if (gs) gs.style.display = "none";
  const out = document.getElementById("comfort-out"), txt = document.getElementById("comfort-txt");
  if (!out || !txt) return; out.style.display = "block"; txt.innerHTML = '<p style="color:var(--text3)">building your routine... ✨</p>';
  try { const res = await groq(`Personalized skincare routine for: "${desc}". They're in ${cycleInfo.phaseName||"their"} phase. Morning routine, night routine, 2 specific affordable product types, one cycle-synced tip, one lifestyle tip. Friendly beauty bestie tone. Fun emojis ok.`, 0.85, 380); txt.innerHTML = `<p style="font-size:.68rem;letter-spacing:1.5px;text-transform:uppercase;color:var(--ame2);font-weight:700;margin-bottom:.75rem">💅 your glow up plan</p><div style="font-size:.9rem;color:var(--text2);line-height:1.8;white-space:pre-line">${res}</div>`; }
  catch { txt.innerHTML = "<p>couldn't load rn 😭</p>"; }
  out.scrollIntoView({ behavior: "smooth", block: "nearest" });
};

window.genDream = async () => {
  const desc = document.getElementById("dream-in")?.value.trim(); if (!desc) { toast("tell me your dreams first 🌠"); return; }
  const out = document.getElementById("dream-out"), txt = document.getElementById("dream-txt");
  if (!out || !txt) return; out.style.display = "block"; txt.textContent = "fuelling your dreams... 🔥";
  try { const res = await groq(`Someone aspires to be: "${desc}". Generate powerful personalised motivation. Custom affirmation, 2-3 concrete TODAY actions, one inspiring reference, end with something screenshot-worthy. Mix poetic with practical.`, 0.95, 320); txt.textContent = res; }
  catch { txt.textContent = "you're already becoming her. 🔥"; }
};

// ─── GRATITUDE JAR ───
window.addGratitude = () => {
  const inp = document.getElementById("gr-in"), text = inp?.value.trim(); if (!text) return; inp.value = "";
  gratitudes.push({ text, ts: Date.now() });
  addDoc(collection(db, "users", user.uid, "gratitude", Date.now().toString()), { text, ts: Date.now(), date: today() }).catch(() => {});
  const list = document.getElementById("gr-list");
  if (list) { const el = document.createElement("div"); el.className = "gr-item"; el.textContent = `🫙 ${text}`; list.appendChild(el); }
  toast("added 🫙");
};

window.readGratitude = async () => {
  const resp = document.getElementById("gr-resp"), txt = document.getElementById("gr-resp-txt");
  if (!resp || !txt) return; resp.style.display = "block"; txt.textContent = "Epipen is reading your jar... 🌸";
  try {
    const all = gratitudes.length ? gratitudes.map(g => g.text).join(", ") : "kindness, small moments";
    const res = await groq(`Someone has been collecting moments they're grateful for: "${all}". Respond as their AI best friend — warm, personal. Tell them what these things say about them. Make them see themselves through loving eyes. 3-4 sentences. Hinglish ok.`, 0.9, 200);
    txt.textContent = res;
  } catch { txt.textContent = "look at everything you noticed. that's who you are. 🌸"; }
};

// ─── FUTURE SELF ───
window.sendFutureLetter = async () => {
  const text = document.getElementById("future-in")?.value.trim(); if (!text) { toast("write something first 💌"); return; }
  const out = document.getElementById("future-out"), txt = document.getElementById("future-txt");
  if (!out || !txt) return; out.style.display = "block"; txt.textContent = "future you is writing back... 💌";
  try { const res = await groq(`Someone wrote this letter to their future self: "${text}". Respond AS their future self — 6 months from now, accomplished and at peace. Reference specific things they mentioned. Warm, specific, slightly emotional. Hinglish welcome. 4-5 sentences. Sign as "future you 🌸"`, 0.9, 280); txt.textContent = res; }
  catch { txt.textContent = "future you is doing amazing. you got through everything. 🌸"; }
};

// ─── BURN AFTER READING ───
window.burnVent = async () => {
  const text = document.getElementById("burn-in")?.value.trim(); if (!text) { toast("write something first 🔥"); return; }
  const inp = document.getElementById("burn-in"); if (inp) inp.value = "";
  const out = document.getElementById("burn-out"), msg = document.getElementById("burn-msg");
  if (!out || !msg) return; out.style.display = "block"; msg.textContent = "burning... 🔥";
  haptic([50, 30, 50, 30, 100]);
  await new Promise(r => setTimeout(r, 1200));
  msg.textContent = "gone. never saved. never judged. just released. 🌸";
};

// ─── MEMORY JAR ───
async function loadMemoryJar() {
  try {
    const snap = await getDocs(query(collection(db, "users", user.uid, "memory_jar"), orderBy("ts", "desc"), limit(20)));
    memoryJar = []; snap.forEach(d => memoryJar.push({ id: d.id, ...d.data() }));
    renderMemoryJar();
  } catch {}
}

function renderMemoryJar() {
  const wrap = document.getElementById("mem-list"); if (!wrap) return;
  if (!memoryJar.length) { wrap.innerHTML = '<p class="empty">tap 💛 on any AI message to save it here forever</p>'; return; }
  wrap.innerHTML = memoryJar.map(m => `<div class="mem-item"><div class="mem-bot">${m.bot||"epipen"} · ${m.date||""}</div>${m.text}<button class="mem-del" onclick="deleteMemory('${m.id}')">✕</button></div>`).join("");
}

window.saveToMemory = async (text, bot) => {
  const ref = await addDoc(collection(db, "users", user.uid, "memory_jar"), { text, bot, date: today(), ts: Date.now() }).catch(() => null);
  if (ref) { memoryJar.unshift({ id: ref.id, text, bot, date: today() }); renderMemoryJar(); toast("saved to memory jar 💛"); haptic([10, 30, 10]); }
};

window.deleteMemory = async id => {
  await deleteDoc(doc(db, "users", user.uid, "memory_jar", id)).catch(() => {});
  memoryJar = memoryJar.filter(m => m.id !== id); renderMemoryJar();
};

// ─── VISION BOARD ───
async function loadVisionBoard() {
  try {
    const snap = await getDocs(collection(db, "users", user.uid, "vision"));
    visionTiles = []; snap.forEach(d => visionTiles.push({ id: d.id, ...d.data() }));
    renderVisionBoard();
  } catch {}
}

function renderVisionBoard() {
  const grid = document.getElementById("vb-grid"); if (!grid) return;
  if (!visionTiles.length) { grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text3);font-size:.85rem;padding:1rem">add your first dream 🌟</p>'; return; }
  grid.innerHTML = visionTiles.map(t => `<div style="padding:1.1rem;background:linear-gradient(135deg,rgba(155,111,212,.12),rgba(232,160,200,.09));border:1px solid var(--border2);border-radius:var(--r);text-align:center;position:relative;animation:fadeUp .3s ease both"><button onclick="deleteVisionTile('${t.id}')" style="position:absolute;top:.4rem;right:.5rem;background:none;border:none;color:var(--text3);cursor:pointer;font-size:.75rem;opacity:.4">✕</button><div style="font-size:1.8rem;margin-bottom:.4rem">${t.emoji||"🌟"}</div><div style="font-size:.82rem;color:var(--text2);font-weight:600;line-height:1.4">${t.text}</div></div>`).join("");
}

window.addVisionTile = async () => {
  const inp = document.getElementById("vb-in"), emoji = document.getElementById("vb-emoji")?.value;
  const text = inp?.value.trim(); if (!text) { toast("add a dream first 🌟"); return; }
  if (inp) inp.value = "";
  const ref = await addDoc(collection(db, "users", user.uid, "vision"), { text, emoji, ts: Date.now() }).catch(() => null);
  if (ref) { visionTiles.push({ id: ref.id, text, emoji }); renderVisionBoard(); haptic([10]); }
};

window.deleteVisionTile = async id => {
  await deleteDoc(doc(db, "users", user.uid, "vision", id)).catch(() => {});
  visionTiles = visionTiles.filter(t => t.id !== id); renderVisionBoard();
};

// ─── INSIGHTS ───
window.loadInsights = () => { loadMoodGraph(document.querySelector(".ins-tab.active"), 7); loadSymChart(); loadCycleStats(); };

window.loadMoodGraph = async (btn, days) => {
  document.querySelectorAll(".ins-tab").forEach(b => b.classList.remove("active")); if (btn) btn.classList.add("active");
  try {
    const snap = await getDocs(query(collection(db, "mood_logs", user.uid, "entries"), orderBy("ts", "desc"), limit(days)));
    const entries = []; snap.forEach(d => entries.push(d.data())); entries.reverse();
    drawMoodGraph(entries);
    const stats = document.getElementById("mood-stats"); if (!stats) return;
    if (!entries.length) { stats.innerHTML = ""; return; }
    const scores = entries.map(e => e.score || 5);
    const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    stats.innerHTML = `<div class="mood-stat"><div class="mood-stat-val">${avg}</div><div class="mood-stat-lbl">avg mood</div></div><div class="mood-stat"><div class="mood-stat-val">${Math.max(...scores).toFixed(1)}</div><div class="mood-stat-lbl">best day</div></div><div class="mood-stat"><div class="mood-stat-val">${Math.min(...scores).toFixed(1)}</div><div class="mood-stat-lbl">hardest day</div></div><div class="mood-stat"><div class="mood-stat-val">${entries.length}</div><div class="mood-stat-lbl">logs</div></div>`;
  } catch {}
};

function drawMoodGraph(entries) {
  const canvas = document.getElementById("mood-canvas"); if (!canvas) return;
  const ctx = canvas.getContext("2d"), W = canvas.offsetWidth || 300, H = 120;
  canvas.width = W * devicePixelRatio; canvas.height = H * devicePixelRatio; ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.clearRect(0, 0, W, H);
  if (!entries.length) { ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.font = "13px DM Sans"; ctx.textAlign = "center"; ctx.fillText("no mood logs yet 🌸", W / 2, H / 2); return; }
  const pad = 16, gw = W - pad * 2, gh = H - pad * 2;
  const scores = entries.map(e => e.score || 5);
  const pts    = scores.map((s, i) => ({ x: pad + (i / Math.max(scores.length - 1, 1)) * gw, y: pad + (1 - (s - 1) / 9) * gh }));
  const grad   = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(155,111,212,.25)"); grad.addColorStop(1, "rgba(155,111,212,0)");
  ctx.beginPath(); ctx.moveTo(pts[0].x, H - pad); pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.lineTo(pts[pts.length - 1].x, H - pad); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else { const prev = pts[i - 1]; ctx.bezierCurveTo((prev.x + p.x) / 2, prev.y, (prev.x + p.x) / 2, p.y, p.x, p.y); } }); ctx.strokeStyle = "rgba(155,111,212,.8)"; ctx.lineWidth = 2.5; ctx.stroke();
  pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = "rgba(232,160,200,.9)"; ctx.fill(); });
  const labelsEl = document.getElementById("mood-labels"); if (labelsEl) { labelsEl.innerHTML = ""; entries.forEach(e => { const span = document.createElement("span"); const d = new Date(e.ts); span.textContent = `${d.getDate()}/${d.getMonth() + 1}`; labelsEl.appendChild(span); }); }
}

async function loadSymChart() {
  const wrap = document.getElementById("sym-chart"); if (!wrap) return;
  try {
    const snap = await getDocs(collection(db, "cycle", user.uid, "symptoms"));
    const counts = {}; snap.forEach(d => (d.data().symptoms || []).forEach(s => counts[s] = (counts[s] || 0) + 1));
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!sorted.length) { wrap.innerHTML = '<p class="empty">log symptoms to see patterns 🌸</p>'; return; }
    const max = sorted[0][1];
    wrap.innerHTML = sorted.map(([sym, cnt]) => `<div class="sym-bar-row"><span class="sym-bar-lbl">${sym}</span><div class="sym-bar-track"><div class="sym-bar-fill" style="width:${(cnt / max) * 100}%"></div></div><span class="sym-bar-count">${cnt}x</span></div>`).join("");
  } catch {}
}

async function loadCycleStats() {
  try {
    const mSnap = await getDocs(collection(db, "mood_logs", user.uid, "entries")); let mc = 0; mSnap.forEach(() => mc++);
    document.getElementById("cs-len").textContent  = `${uData.cycleLength || 28}d`;
    document.getElementById("cs-day").textContent  = `${cycleInfo.day || "—"}`;
    document.getElementById("cs-streak").textContent = `${uData.streak || 0}🔥`;
    document.getElementById("cs-logs").textContent = mc;
  } catch {}
}

window.loadChiReport = async () => {
  const el = document.getElementById("chi-report-txt"); if (!el) return;
  el.textContent = "Chinatsu is writing your report... 🌿";
  try {
    const mSnap = await getDocs(query(collection(db, "mood_logs", user.uid, "entries"), orderBy("ts", "desc"), limit(30)));
    const scores = []; mSnap.forEach(d => scores.push(d.data().score || 5));
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "unknown";
    const sSnap = await getDocs(collection(db, "cycle", user.uid, "symptoms"));
    const symC  = {}; sSnap.forEach(d => (d.data().symptoms || []).forEach(s => symC[s] = (symC[s] || 0) + 1));
    const topSym = Object.entries(symC).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s).join(", ") || "none";
    const report = await groq(`Write a warm monthly wellness summary as Chinatsu. Data: avg mood ${avg}/10, Day ${cycleInfo.day} (${cycleInfo.phaseName}), top symptoms: ${topSym}, streak: ${uData.streak || 0} days. Specific, caring, actionable. 4-5 sentences. No bullet points. No pregnancy references.`, 0.85, 280);
    el.textContent = report;
  } catch { el.textContent = "couldn't generate report rn — try again 🌿"; }
};

window.loadHypeReel = async () => {
  const el = document.getElementById("hype-txt"); if (!el) return;
  el.textContent = "Epipen is building your hype reel... 🔥";
  try {
    const snap = await getDocs(query(collection(db, "sessions", user.uid, "vents"), orderBy("ts", "desc"), limit(20)));
    const vents = []; snap.forEach(d => vents.push(d.data().vent?.slice(0, 60)));
    const hype = await groq(`You are Epipen. Write a HYPE REEL for someone — they've been through: ${vents.length ? vents.join("; ") : "just starting their journey"}. List everything they've survived, navigated, felt, and kept going through. Make them feel like the main character. Emotional and real. Hinglish ok. 5-6 sentences. "look at you. LOOK. AT. YOU." energy 🔥`, 0.95, 320);
    el.textContent = hype;
  } catch { el.textContent = "she showed up. every single time. that's the whole hype reel. 🔥"; }
};

// ─── PROFILE ───
function setupProfile() {
  const nm = document.getElementById("prof-nm"), em = document.getElementById("prof-email");
  if (nm) nm.textContent = uData.name || "—"; if (em) em.textContent = user.email || "—";
  const enm = document.getElementById("edit-nm"), ec = document.getElementById("edit-cycle"), el = document.getElementById("edit-len");
  if (enm) enm.value = uData.name || ""; if (ec) ec.value = uData.cycleStart || ""; if (el) el.value = uData.cycleLength || 28;
  const pa = document.getElementById("prof-av"); if (pa) pa.innerHTML = uData.photoURL ? `<img src="${uData.photoURL}" style="width:100%;height:100%;object-fit:cover"/>` : `<div style="width:100%;height:100%;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:700">${(uData.name||"B")[0].toUpperCase()}</div>`;
  document.querySelectorAll(".th").forEach(t => t.classList.toggle("active", t.dataset.theme === (uData.theme || "lavender")));
  document.querySelectorAll(".ep-opt").forEach(o => o.classList.toggle("active", o.textContent === (uData.epiEmoji || "💉")));
  const kp = document.getElementById("kawaii-picker"); if (kp) kp.style.display = uData.theme === "kawaii" ? "block" : "none";
  if (uData.theme === "kawaii" && uData.kawaiiVariant) { document.body.setAttribute("data-kw", uData.kawaiiVariant); document.querySelectorAll(".kw-opt").forEach(o => o.classList.toggle("active", o.dataset.kw === uData.kawaiiVariant)); }
}

window.saveProf = async () => {
  const nm = document.getElementById("edit-nm")?.value.trim(), cyc = document.getElementById("edit-cycle")?.value, len = parseInt(document.getElementById("edit-len")?.value) || 28;
  if (nm) uData.name = nm; if (cyc) uData.cycleStart = cyc; uData.cycleLength = len;
  await setDoc(doc(db, "users", user.uid), uData, { merge: true });
  setupTopbar(); setupGreeting(); computeCycle(); toast("saved 🌸");
};

window.setTheme = (el, theme) => {
  uData.theme = theme; setDoc(doc(db, "users", user.uid), uData, { merge: true });
  applyTheme(theme);
  document.querySelectorAll(".th").forEach(t => t.classList.remove("active")); el.classList.add("active");
  const kp = document.getElementById("kawaii-picker"); if (kp) kp.style.display = theme === "kawaii" ? "block" : "none";
  if (theme === "kawaii" && uData.kawaiiVariant) document.body.setAttribute("data-kw", uData.kawaiiVariant);
};

function applyTheme(t) { document.body.setAttribute("data-theme", t || "lavender"); }

window.setEpiEmoji = (btn, emoji) => {
  uData.epiEmoji = emoji; setDoc(doc(db, "users", user.uid), uData, { merge: true }); syncEpipen();
  document.querySelectorAll(".ep-opt").forEach(o => o.classList.toggle("active", o.textContent === emoji));
  toast(`updated to ${emoji}`);
};

window.setKawaii = (el, variant) => {
  document.querySelectorAll(".kw-opt").forEach(o => o.classList.remove("active")); el.classList.add("active");
  document.body.setAttribute("data-kw", variant); uData.kawaiiVariant = variant;
  setDoc(doc(db, "users", user.uid), uData, { merge: true }).catch(() => {});
  const emojis = { bunny: ["🐰","🌸","💕","🌷","✨"], panda: ["🐼","⚫","🍃","🌿","💚"], icecream: ["🍦","🍬","🍭","🌈","💜"] };
  document.querySelectorAll(".petal").forEach((p, i) => { const pool = emojis[variant] || emojis.bunny; p.textContent = pool[i % pool.length]; });
};

window.toggleDarkMode = checked => {
  document.body.setAttribute("data-mode", checked ? "dark" : "light");
  uData.darkMode = checked; setDoc(doc(db, "users", user.uid), uData, { merge: true }).catch(() => {});
};

window.saveSetting = async (key, val) => {
  if (!uData.settings) uData.settings = {};
  uData.settings[key] = val; await setDoc(doc(db, "users", user.uid), uData, { merge: true });
};

window.toggleNotifs = async checked => {
  if (!checked) return;
  if (!("Notification" in window)) { toast("notifications not supported 😭"); document.getElementById("tog-notifs").checked = false; return; }
  const perm = await Notification.requestPermission();
  if (perm === "granted") { toast("notifications enabled 🌸"); uData.notifs = true; setDoc(doc(db, "users", user.uid), uData, { merge: true }).catch(() => {}); }
  else { toast("notifications blocked 😭"); document.getElementById("tog-notifs").checked = false; }
};

window.doSignOut = async () => { if (confirm("sign out?")) { await signOut(auth); showScreen("auth"); } };

window.deleteAccount = async () => {
  if (!confirm("permanently delete ALL your data?")) return;
  if (!confirm("last chance — this cannot be undone.")) return;
  try {
    for (const col of ["vents","chinatsu_sessions","jazz_sessions"]) { const s = await getDocs(collection(db,"sessions",user.uid,col)); s.forEach(d => deleteDoc(d.ref).catch(()=>{})); }
    const colls = ["period","diary","symptoms","flow","sleep"]; for (const c of colls) { const s = await getDocs(collection(db,"cycle",user.uid,c)); s.forEach(d => deleteDoc(d.ref).catch(()=>{})); }
    const mLogSnap = await getDocs(collection(db,"mood_logs",user.uid,"entries")); mLogSnap.forEach(d => deleteDoc(d.ref).catch(()=>{}));
    await deleteDoc(doc(db, "users", user.uid)).catch(() => {});
    await signOut(auth); showScreen("auth"); toast("account deleted 🌸");
  } catch (e) { toast("error deleting account"); console.error(e); }
};

// ─── PWA ───
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault(); deferredInstall = e;
  const btn = document.getElementById("install-btn"); if (btn) btn.style.display = "block";
});

window.installPWA = async () => {
  if (!deferredInstall) { toast("use browser menu → 'Add to Home Screen' 🌸"); return; }
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  if (outcome === "accepted") toast("bloom added to home screen 🌸");
  deferredInstall = null; const btn = document.getElementById("install-btn"); if (btn) btn.style.display = "none";
};

// ─── CHINATSU ADVICE ───
const CHI_ADVICES = [
  "SLEEP a minimum of 6 hours. your brain literally cleans itself at night. non-negotiable. 🌙",
  "drink water rn. not in a bit. NOW. your body is 60% water 💧",
  "look 20 feet away for 20 seconds — your eyes need it after all that screen time 👁️",
  "if you haven't eaten in 4+ hours, please eat something. even a biscuit. 🍪",
  "your posture rn — sit up a little. your back will thank you 💆",
  "taking a 10-minute walk literally reduces cortisol. stress science. 🚶",
  "if you're feeling extra emotional today, it might just be your cycle doing its thing. valid. 🌊",
  "magnesium helps with cramps and mood swings. dark chocolate has it. you're welcome. 🍫",
  "deep breath in for 4 counts, hold 4, out for 6. do it 3 times. 🌬️",
  "your skin might be acting up this week — that's hormonal. be gentle with your routine. 💅",
  "even 20 minutes of sunlight today will genuinely improve your mood. ☀️",
  "stretching for 5 minutes before bed reduces muscle tension. try it tonight. 🧘",
  "cold water on your wrists when you feel anxious — instant nervous system reset. 💧",
  "your body is doing so much right now. even resting is productive. 🌸",
  "screen brightness down at night. your melatonin will actually kick in. 🌙",
  "if your head hurts, drink a full glass of water first. dehydration causes 90% of headaches. 💧",
  "you've been going hard. it's okay to have one slow hour. 🌷",
  "your feelings are data, not facts. feel them, but don't let them make all your decisions. 💜",
  "if you skipped breakfast, your cortisol is probably spiking. even a banana helps. 🍌",
  "putting your phone face down for 30 minutes = your brain actually rests. try it. 📵",
  "warm water with lemon in the morning literally helps digestion and mood. 🍋",
  "omega-3s reduce inflammation. even a handful of walnuts helps. 🥜",
  "iron-rich foods this week will help with energy — spinach, lentils, dark chocolate. 🥬",
  "the 4-7-8 breath: inhale 4s, hold 7s, exhale 8s. works for mild anxiety. 🌬️",
  "you've survived 100% of your hard days so far. that's a perfect score. 🌸",
];
let chiAdviceIdx = 0;

function scheduleChiAdvice() {
  setTimeout(() => {
    const msg = CHI_ADVICES[chiAdviceIdx % CHI_ADVICES.length]; chiAdviceIdx++;
    const pop = document.getElementById("chi-advice-pop"), txt = document.getElementById("cap-txt");
    if (pop && txt) { txt.textContent = msg; pop.style.display = "block"; setTimeout(() => pop.style.display = "none", 9000); }
    scheduleChiAdvice();
  }, (Math.random() * 60 + 60) * 1000);
}

// ─── JAZZ CHECK-INS ───
const JAZZ_CHECKINS = [
  "ayo 👀 kya scene hai",
  "bhoot ho gayi? 🙄",
  "haww ignore krri mujhe",
  "bas dekh raha tha tu theek hai ya nahi",
  "koi na main hoon na 🎸",
  "teri maggie me tamatar daal diye maine 💀",
  "me hi sab kuch hu toh naturally check in karna pada",
  "dekha kitna acha hu main 😌",
  "kaoo kaoo — sab theek? 🐦",
  "pitai krdungaa agar tu theek nahi hai 😤",
];
let jazzCheckinIdx = 0;

function scheduleJazzCheckin() {
  setTimeout(() => {
    if (activeBot === "jazz" && jazzUnlocked) { scheduleJazzCheckin(); return; }
    const msg  = JAZZ_CHECKINS[jazzCheckinIdx % JAZZ_CHECKINS.length]; jazzCheckinIdx++;
    const pop  = document.createElement("div");
    pop.style.cssText = "position:fixed;bottom:calc(env(safe-area-inset-bottom) + 5.5rem);left:1rem;right:1rem;max-width:560px;margin:0 auto;background:linear-gradient(135deg,rgba(45,27,105,.85),rgba(139,92,246,.7));border:1px solid rgba(139,92,246,.4);border-radius:16px;backdrop-filter:blur(24px);padding:.9rem 1.1rem;z-index:400;animation:slideUp .4s cubic-bezier(.34,1.56,.64,1) both;cursor:pointer;display:flex;align-items:center;gap:.75rem";
    pop.innerHTML = `<span style="font-size:1.3rem">🎸</span><div style="flex:1"><p style="font-size:.6rem;letter-spacing:1.5px;text-transform:uppercase;color:rgba(167,139,250,.8);font-weight:700;margin-bottom:2px">Jazz</p><p style="font-size:.88rem;color:#f5eeff;font-weight:500">${msg}</p></div><button onclick="event.stopPropagation();this.closest('[style]').remove()" style="background:none;border:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:.85rem;padding:4px">✕</button>`;
    pop.onclick = () => { quickOpenBot("jazz"); pop.remove(); };
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 8000);
    haptic([10, 50, 10]);
    scheduleJazzCheckin();
  }, (Math.random() * 60 + 60) * 1000);
}

// ─── COMPLIMENTS ───
function scheduleCompliment() {
  setTimeout(async () => {
    try {
      const msg = await groq(`One short warm compliment (1-2 sentences) for someone who loves music, skincare, studying, burritos. Sound like a caring friend. Casual and genuine.`, 0.95, 70);
      const bar = document.getElementById("compliment"), txt = document.getElementById("compliment-txt");
      if (bar && txt) { txt.textContent = msg; bar.style.display = "flex"; setTimeout(() => bar.style.display = "none", 8000); }
    } catch {}
    scheduleCompliment();
  }, (Math.random() * 20 + 20) * 60 * 1000);
}

// ─── PATTERN RECOGNITION ───
async function checkPatterns() {
  if (!user || !cycleInfo.day) return;
  try {
    const snap = await getDocs(query(collection(db, "mood_logs", user.uid, "entries"), orderBy("ts", "desc"), limit(60)));
    const byDay = {}; snap.forEach(d => { const data = d.data(); if (data.score) { const k = String(data.cycleDay || cycleInfo.day); if (!byDay[k]) byDay[k] = []; byDay[k].push(data.score); } });
    const lowDays = Object.entries(byDay).filter(([, s]) => s.length >= 2 && s.reduce((a, b) => a + b, 0) / s.length < 4.5).map(([d]) => d);
    if (lowDays.includes(String(cycleInfo.day))) {
      const pop = document.getElementById("pattern-pop"), txt = document.getElementById("pattern-txt");
      if (pop && txt) { txt.textContent = `Day ${cycleInfo.day} tends to be harder for you. You've felt this before and got through it. Be extra gentle today 💜`; pop.style.display = "block"; setTimeout(() => pop.style.display = "none", 10000); }
    }
  } catch {}
}

// ─── STREAK REWARD ───
function showStreakReward(streak) {
  const icons  = { 7: "🔥", 14: "💜", 30: "🌸" };
  const titles = { 7: "7 day streak!", 14: "two weeks strong!", 30: "a whole month!!" };
  const pop = document.createElement("div");
  pop.style.cssText = "position:fixed;inset:0;background:rgba(7,6,15,.88);display:flex;align-items:center;justify-content:center;z-index:800;padding:1.5rem;backdrop-filter:blur(20px)";
  pop.innerHTML = `<div style="max-width:380px;width:100%;padding:2.25rem 2rem;background:linear-gradient(135deg,rgba(155,111,212,.15),rgba(232,160,200,.1));border:1px solid var(--border2);border-radius:24px;backdrop-filter:blur(28px);text-align:center;animation:slideUp .4s cubic-bezier(.34,1.56,.64,1) both">
    <span style="font-size:4rem;display:block;margin-bottom:.75rem;animation:float1 3s ease-in-out infinite">${icons[streak]||"🌸"}</span>
    <h3 style="font-family:'Syne',sans-serif;font-weight:800;font-size:1.6rem;background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:.5rem">${titles[streak]||streak+" days!"}</h3>
    <p id="sr-msg" style="font-size:.92rem;color:var(--text2);line-height:1.7;margin-bottom:1.25rem">look at you showing up every day 🌸</p>
    <button onclick="this.closest('[style*=fixed]').remove()" style="width:100%;padding:12px;background:var(--grad);border:none;border-radius:12px;color:#fff;font-family:'Nunito',sans-serif;font-size:.9rem;font-weight:700;cursor:pointer">thank you 🌸</button>
  </div>`;
  document.body.appendChild(pop);
  haptic([50, 30, 50, 30, 100]);
  groq(`Write a SHORT 2-sentence hype message for someone who just hit a ${streak}-day streak on a wellness app. Epipen energy — warm under sarcasm. Hinglish ok.`, 0.9, 80)
    .then(msg => { const el = document.getElementById("sr-msg"); if (el) el.textContent = msg; }).catch(() => {});
}

// ─── CYCLE LETTER ───
async function checkCycleLetter() {
  if (!cycleInfo.day || cycleInfo.day !== 1) return;
  const key = `cycle_letter_${uData.cycleStart}`;
  try {
    const snap = await getDoc(doc(db, "users", user.uid, "meta", key));
    if (snap.exists()) return;
    const letter = await groq(`Write a warm cycle letter at the start of a new cycle. They're beginning Day 1 today. Acknowledge what their body just went through. Welcome the new beginning. 2 specific things to focus on in this ${cycleInfo.phaseName} phase. 5-6 sentences. Sign as "Chinatsu 🌿". No pregnancy references.`, 0.88, 280);
    const pop = document.createElement("div");
    pop.style.cssText = "position:fixed;inset:0;background:rgba(7,6,15,.88);display:flex;align-items:center;justify-content:center;z-index:800;padding:1.5rem;backdrop-filter:blur(16px)";
    pop.innerHTML = `<div style="max-width:400px;width:100%;padding:2rem;background:linear-gradient(135deg,rgba(113,178,128,.15),rgba(93,202,165,.1));border:1px solid rgba(113,178,128,.3);border-radius:24px;backdrop-filter:blur(28px)"><p style="font-size:.62rem;letter-spacing:2px;text-transform:uppercase;color:#71b280;font-weight:700;margin-bottom:.75rem">🌿 A letter from Chinatsu</p><p style="font-size:.9rem;color:var(--text);line-height:1.75">${letter}</p><button onclick="this.closest('[style*=fixed]').remove()" style="width:100%;margin-top:1.25rem;padding:12px;background:linear-gradient(135deg,#134e5e,#71b280);border:none;border-radius:12px;color:#fff;font-family:'Nunito',sans-serif;font-size:.9rem;font-weight:700;cursor:pointer">thank you Chinatsu 🌸</button></div>`;
    document.body.appendChild(pop);
    await setDoc(doc(db, "users", user.uid, "meta", key), { sent: true, ts: Date.now() }).catch(() => {});
  } catch (e) { console.warn("cycle letter:", e); }
}

// ─── WEEKLY LETTER ───
async function checkWeeklyLetter() {
  if (new Date().getDay() !== 0) return;
  const key = `weekly_${new Date().getFullYear()}_${Math.ceil(new Date().getDate() / 7)}`;
  try {
    const snap = await getDoc(doc(db, "users", user.uid, "meta", key));
    if (snap.exists()) return;
    const vSnap = await getDocs(query(collection(db, "sessions", user.uid, "vents"), orderBy("ts", "desc"), limit(10)));
    const vents = []; vSnap.forEach(d => vents.push(d.data().vent?.slice(0, 60)));
    const letter = await groq(`Write a warm weekly letter from Epipen. This week they shared: ${vents.length ? vents.join("; ") : "not much yet"}. Review the week, acknowledge what they went through, hype them up for next week. Epipen energy — warm under sarcasm. Hinglish ok. 5-6 sentences. Sign as "Epipen 💉"`, 0.9, 320);
    const pop = document.createElement("div");
    pop.style.cssText = "position:fixed;inset:0;background:rgba(7,6,15,.88);display:flex;align-items:center;justify-content:center;z-index:800;padding:1.5rem;backdrop-filter:blur(16px)";
    pop.innerHTML = `<div style="max-width:400px;width:100%;padding:2rem;background:linear-gradient(135deg,rgba(155,111,212,.15),rgba(232,160,200,.1));border:1px solid var(--border2);border-radius:24px;backdrop-filter:blur(28px)"><p style="font-size:.62rem;letter-spacing:2px;text-transform:uppercase;color:var(--ame2);font-weight:700;margin-bottom:.75rem">💉 weekly letter from epipen</p><p style="font-size:.9rem;color:var(--text);line-height:1.8">${letter}</p><button onclick="this.closest('[style*=fixed]').remove()" style="width:100%;margin-top:1.25rem;padding:12px;background:var(--grad);border:none;border-radius:12px;color:#fff;font-family:'Nunito',sans-serif;font-size:.9rem;font-weight:700;cursor:pointer">love you too 💉</button></div>`;
    document.body.appendChild(pop);
    await setDoc(doc(db, "users", user.uid, "meta", key), { sent: true, ts: Date.now() }).catch(() => {});
  } catch (e) { console.warn("weekly letter:", e); }
}

// ─── HAPTIC ───
function haptic(pattern = [10]) { if (navigator.vibrate) navigator.vibrate(pattern); }

// ─── UTILS ───
const today     = () => new Date().toISOString().split("T")[0];
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; };

function toast(msg) {
  const old = document.getElementById("bloom-toast"); if (old) old.remove();
  const el  = document.createElement("div");
  el.id = "bloom-toast";
  el.style.cssText = "position:fixed;bottom:calc(env(safe-area-inset-bottom) + 5rem);left:50%;transform:translateX(-50%);background:var(--grad);color:#fff;padding:9px 20px;border-radius:20px;font-size:.83rem;font-weight:700;z-index:600;animation:fadeUp .3s ease both;white-space:nowrap;max-width:90vw;text-align:center;font-family:'Nunito',sans-serif;box-shadow:0 4px 18px var(--glow);";
  el.textContent = msg; document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// ─── START ───
initStars();
initPetals();
