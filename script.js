// Kaizen by Unravel Labs ⚔️
// continuous improvement

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, orderBy, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── CONFIG ───
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
const MODEL_DEPTH    = "moonshotai/kimi-k2-instruct";     // Musashi, Guts, Sasuke, Thorfinn
const MODEL_LIGHT    = "meta-llama/llama-4-scout-17b-16e-instruct"; // Luffy, Hinata
const MODEL_FALLBACK = "llama-3.3-70b-versatile";

// ─── INIT ───
const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);
setPersistence(auth, browserLocalPersistence);

// ─── STATE ───
let user = null, uData = {}, memory = "";
let activeBot = "musashi", activeBotSession = null;
let activeBotHist = [];
let sparBot = "guts", sparHist = [];
let quietHist = [];
let waterCount = 0, workoutType = null;
let obGoals = [], obFirstBot = "musashi";
let deferredInstall = null;
let goals = [];

// ─── GROQ ───
async function groq(prompt, temp = 0.85, maxTok = 300, model = MODEL_DEPTH) {
  return groqChat([{ role: "user", content: prompt }], temp, maxTok, model);
}

async function groqChat(messages, temp = 0.85, maxTok = 300, model = MODEL_DEPTH) {
  const tryM = async m => {
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
  try { return await tryM(model); }
  catch (e) { if (model !== MODEL_FALLBACK) return await tryM(MODEL_FALLBACK); throw e; }
}

// ─── LOADING ───
function hideLoading() {
  const el = document.getElementById("loading");
  if (!el) return;
  el.style.opacity = "0";
  setTimeout(() => el.style.display = "none", 500);
}

// ─── GRID CANVAS ───
function initGrid() {
  const c = document.getElementById("grid-canvas");
  if (!c) return;
  const ctx = c.getContext("2d");
  const resize = () => { c.width = innerWidth; c.height = innerHeight; drawGrid(); };
  function drawGrid() {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "rgba(249,115,22,.06)";
    ctx.lineWidth   = 1;
    const sz = 44;
    for (let x = 0; x < c.width; x += sz) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke(); }
    for (let y = 0; y < c.height; y += sz) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke(); }
  }
  resize();
  window.addEventListener("resize", resize);
  // subtle parallax on desktop
  if (window.innerWidth >= 768) {
    window.addEventListener("mousemove", e => {
      const mx = (e.clientX / innerWidth  - 0.5) * 10;
      const my = (e.clientY / innerHeight - 0.5) * 6;
      c.style.transform = `translate(${mx}px,${my}px)`;
    });
  }
}

// ─── SCREENS ───
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.style.display = "none");
  const el = document.getElementById(`s-${id}`); if (el) el.style.display = "block";
}

// ─── AUTH ───
document.getElementById("btn-google").addEventListener("click", async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { console.error(e); toast("sign in failed"); }
});

onAuthStateChanged(auth, async u => {
  if (u) {
    user = u;
    try {
      const snap = await getDoc(doc(db, "kaizen_users", u.uid));
      if (snap.exists()) { uData = snap.data(); hideLoading(); launch(); }
      else { hideLoading(); showScreen("onboard"); }
    } catch (e) { console.error(e); hideLoading(); showScreen("onboard"); }
  } else { hideLoading(); showScreen("auth"); }
});

// ─── ONBOARD ───
window.toggleGoal = (el, goal) => {
  el.classList.toggle("active");
  if (el.classList.contains("active")) { if (!obGoals.includes(goal)) obGoals.push(goal); }
  else { obGoals = obGoals.filter(g => g !== goal); }
};

window.selectObBot = (el, bot) => {
  document.querySelectorAll(".ob-bot").forEach(b => b.classList.remove("active"));
  el.classList.add("active"); obFirstBot = bot;
};

window.obNext = async step => {
  if (step === 1) {
    const nm = document.getElementById("ob-name")?.value.trim();
    if (!nm) { toast("enter your name"); return; }
    uData.name = nm;
    document.getElementById("ob1").classList.remove("active");
    document.getElementById("ob2").classList.add("active");
    document.getElementById("ob-fill").style.width = "66%";
  } else {
    document.getElementById("ob2").classList.remove("active");
    document.getElementById("ob3").classList.add("active");
    document.getElementById("ob-fill").style.width = "100%";
  }
};

window.obFinish = async () => {
  uData = { ...uData, uid: user.uid, photoURL: user.photoURL || null, goals: obGoals, firstBot: obFirstBot, theme: "forge", settings: { checkin: true }, streak: 0, createdAt: new Date().toISOString() };
  await setDoc(doc(db, "kaizen_users", user.uid), uData);
  launch();
};

// ─── LAUNCH ───
async function launch() {
  showScreen("app");
  applyTheme(uData.theme || "forge");
  setupTopbar(); setupGreeting(); loadStreak();
  loadMemory(); loadWisdom(); loadKaizenScore();
  loadGoals(); loadBattleHistory(); loadWinList();
  initDesktopSidebar(); checkSundayDebrief();

  // keyboard listener for bot chat
  const botIn = document.getElementById("bot-in");
  if (botIn) botIn.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendBotMsg(); } });

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); deferredInstall = e;
    const btn = document.getElementById("install-btn"); if (btn) btn.style.display = "block";
  });
}

// ─── TOPBAR / SIDEBAR ───
function setupTopbar() {
  const wrap = document.getElementById("av-wrap"); if (!wrap) return;
  wrap.innerHTML = "";
  const div = document.createElement("div");
  div.style.cssText = "width:26px;height:26px;border-radius:50%;border:1.5px solid var(--acc);cursor:pointer;overflow:hidden;flex-shrink:0";
  if (uData.photoURL) { div.innerHTML = `<img src="${uData.photoURL}" style="width:100%;height:100%;object-fit:cover"/>`; }
  else { div.style.cssText += ";background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:700"; div.textContent = (uData.name || "W")[0].toUpperCase(); }
  wrap.appendChild(div);
}

function setupGreeting() {
  const h  = new Date().getHours();
  const gt = h < 5 ? "still up?" : h < 12 ? "good morning" : h < 17 ? "good afternoon" : h < 21 ? "good evening" : "late night grind";
  const el = document.getElementById("gr-time"); if (el) el.textContent = gt;
  const nm = document.getElementById("gr-name"); if (nm) nm.textContent = uData.name || "warrior";
  const sub = document.getElementById("gr-sub"); if (sub) sub.textContent = `day ${uData.streak || 1} of the path`;
}

function initDesktopSidebar() {
  if (window.innerWidth < 768) return;
  const nav = document.getElementById("main-nav");
  if (!nav || nav.querySelector(".nav-brand")) return;
  const brand = document.createElement("div"); brand.className = "nav-brand";
  brand.innerHTML = `<span class="nav-brand-logo">kaizen ⚔️</span><span class="nav-brand-tag">continuous improvement</span>`;
  nav.insertBefore(brand, nav.firstChild);
  const footer = document.createElement("div"); footer.className = "nav-footer";
  footer.innerHTML = `${uData.photoURL ? `<img class="nav-footer-av" src="${uData.photoURL}"/>` : `<div class="nav-footer-av" style="background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:700">${(uData.name||"W")[0].toUpperCase()}</div>`}<div style="flex:1;min-width:0"><div class="nav-footer-name">${uData.name||"warrior"}</div><div class="nav-footer-streak">🔥 ${uData.streak||0} day streak</div></div>`;
  nav.appendChild(footer);
}

// ─── NAV ───
const PAGE_MSGS = {
  home: ["stay on the path ⚔️", "another day, another step 🔥"],
  bots: ["choose your warrior 🗡️", "who do you need today?"],
  battle: ["log it. own it. ⚔️"],
  grind: ["track it or it didn't happen 💪"],
  path: ["eyes on the horizon 🎯"],
  insights: ["data doesn't lie 📊"],
  profile: ["know thyself 🗡️"]
};

window.navTo = (page, navEl) => {
  haptic([8]);
  const wipe = document.getElementById("wipe");
  wipe.classList.add("on");
  setTimeout(() => {
    document.querySelectorAll(".pg").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".ni").forEach(n => n.classList.remove("active"));
    document.getElementById(`pg-${page}`)?.classList.add("active");
    if (navEl) navEl.classList.add("active");
    wipe.classList.remove("on");
    if (page === "insights") loadInsights();
    if (page === "profile")  setupProfile();
    if (page === "battle")   loadBattleHistory();
    if (page === "grind")    loadGrindSummary();
    if (page === "path")     loadGoals();
    const msgs = PAGE_MSGS[page];
    if (msgs) showPop(msgs[Math.floor(Math.random() * msgs.length)]);
  }, 160);
};

function showPop(text) {
  const p = document.getElementById("pg-pop"); if (!p) return;
  p.textContent = text; p.style.display = "block";
  setTimeout(() => p.style.display = "none", 2400);
}

window.quickBot = bot => {
  navTo("bots", document.querySelector(".ni:nth-child(2)"));
  setTimeout(() => openBot(bot), 220);
};

// ─── STREAK ───
async function loadStreak() {
  try {
    const todayStr = today(), yest = yesterday();
    let streak = uData.streak || 0;
    const last  = uData.lastLogin || "";
    if (last === todayStr) { /* same */ }
    else if (last === yest) { streak++; }
    else { streak = 1; }
    uData.streak = streak; uData.lastLogin = todayStr;
    await setDoc(doc(db, "kaizen_users", user.uid), uData, { merge: true });
    const el = document.getElementById("streak-num"); if (el) el.textContent = streak;
    const fs = document.querySelector(".nav-footer-streak"); if (fs) fs.textContent = `🔥 ${streak} day streak`;
  } catch (e) { console.error("streak:", e); }
}

// ─── MEMORY ───
async function loadMemory() {
  try {
    const q    = query(collection(db, "kaizen_sessions", user.uid, "logs"), orderBy("ts", "desc"), limit(10));
    const snap = await getDocs(q);
    const items = []; snap.forEach(d => items.push(d.data()));
    if (items.length) memory = items.reverse().map(v => `- he said: "${v.text?.slice(0, 70)}"`).join("\n");
  } catch {}
}

// ─── KAIZEN SCORE ───
async function loadKaizenScore() {
  try {
    const today_str = today();
    const snap = await getDoc(doc(db, "kaizen_users", user.uid, "grind", today_str));
    const data = snap.exists() ? snap.data() : {};
    let score  = 0;
    if (uData.streak > 0)   score += Math.min(uData.streak * 2, 20);
    if (data.sleep >= 7)     score += 20;
    if (data.water >= 6)     score += 15;
    if (data.workout)        score += 20;
    if (data.study >= 2)     score += 15;
    if (data.daily3)         score += 10;
    const el = document.getElementById("kaizen-score"); if (el) el.textContent = Math.min(score, 100);
  } catch {}
}

// ─── WISDOM ───
window.loadWisdom = async () => {
  const el = document.getElementById("wisdom-txt"); if (!el) return;
  el.textContent = "...";
  try {
    const wisdom = await groq(`You are Miyamoto Musashi. Give one short sharp piece of wisdom for today. Max 2 sentences. Direct, not poetic fluff. Relevant to someone trying to improve themselves daily. No quotes, no attribution. Just the wisdom.`, 0.9, 80, MODEL_DEPTH);
    el.textContent = wisdom;
  } catch { el.textContent = "Today's victory is simply showing up. Tomorrow demands more."; }
};

// ─── BOT SYSTEMS ───
const BOT_INFO = {
  musashi:  { name: "Musashi",  ico: "🗡️", sub: "discipline · the path · clarity",   style: "musashi-style",  model: MODEL_DEPTH },
  guts:     { name: "Guts",     ico: "⚔️", sub: "push through · raw · no excuses",   style: "guts-style",     model: MODEL_DEPTH },
  sasuke:   { name: "Sasuke",   ico: "🔥", sub: "cold · calculated · channel it",    style: "sasuke-style",   model: MODEL_DEPTH },
  luffy:    { name: "Luffy",    ico: "🌊", sub: "chaos · joy · just go",             style: "luffy-style",    model: MODEL_LIGHT },
  hinata:   { name: "Hinata",   ico: "🏐", sub: "underdog · never stop · rise",      style: "hinata-style",   model: MODEL_LIGHT },
  thorfinn: { name: "Thorfinn", ico: "🌿", sub: "quiet · wise · just be here",       style: "thorfinn-style", model: MODEL_DEPTH },
};

function botSystem(bot) {
  const nm = uData.name || "him";
  const personalities = {
    musashi: `You are Miyamoto Musashi, the greatest swordsman who ever lived — speaking to a young man who wants to improve himself.
YOUR STYLE: Direct. Calm. No wasted words. You've seen war, death, and victory. You don't sugarcoat but you're not cruel. You believe in discipline over motivation, practice over talk.
CORE BELIEFS: The path is the point. Weakness is temporary if you act. Complaining is wasted energy. Results come from daily practice not inspiration.
HOW YOU RESPOND: Short, direct sentences. Sometimes philosophical but always practical. You ask questions that cut to the truth. You don't validate excuses.
NEVER: be soft, say "I understand how hard that is", use emoji, be a therapist.
USER: ${nm}. Goals: ${uData.goals?.join(", ")||"improvement"}. Streak: ${uData.streak||0} days.
MEMORY:\n${memory||"First conversation."}`,

    guts: `You are Guts from Berserk — the Black Swordsman. You've lost everything multiple times and kept going anyway.
YOUR STYLE: Brutal honesty. You don't do comfort unless someone's truly broken — and even then, brief. You've fought through nightmares that would destroy anyone else. You KNOW what it means to keep going when there's no reason to.
CORE BELIEFS: No one's coming to save you. Self-pity is a waste of time. Pain means you're still alive. The only way out is through.
HOW YOU RESPOND: Short, rough, direct. Sometimes 1-2 sentences. You call out weak thinking immediately. If someone's genuinely suffering you acknowledge it briefly then redirect to action.
NEVER: be gentle without cause, give empty encouragement, use soft language.
USER: ${nm}. MEMORY:\n${memory||"First conversation."}`,

    sasuke: `You are Sasuke Uchiha — after his redemption arc. Cold intelligence, absolute focus. You've made mistakes, carried darkness, and chose a different path.
YOUR STYLE: Few words. Precise. You see through weak reasoning immediately. You understand darkness and ambition — you've lived it. You don't encourage without reason and you don't condemn without cause.
CORE BELIEFS: Power is earned, not given. Pain is a teacher. Being alone by choice is different from being alone by failure. Goals must be worthy of sacrifice.
HOW YOU RESPOND: Cold but not cruel. Minimal words. Cut to the real issue. Ask sharp questions. Occasionally reveal that you understand weakness — because you've been there.
NEVER: be warm without reason, over-explain, be impressed easily.
USER: ${nm}. MEMORY:\n${memory||"First conversation."}`,

    luffy: `You are Monkey D. Luffy — the future King of the Pirates.
YOUR STYLE: You genuinely don't understand why someone would give up. Not because you're naive — you've faced death, loss, and impossibility — but because giving up literally doesn't register as an option in your brain. You're chaotic, honest, and surprisingly wise despite seeming simple.
CORE BELIEFS: If you want something, go get it. Friends are worth everything. Being yourself is the only way. Meat is good. Problems are just adventures you haven't finished yet.
HOW YOU RESPOND: Enthusiastic but not fake. Confused by excuses in a funny way. Sometimes say something simple that's accidentally profound. Use food metaphors occasionally.
NEVER: be serious for too long, overthink, use formal language.
USER: ${nm}. MEMORY:\n${memory||"First conversation."}`,

    hinata: `You are Shoyo Hinata from Haikyuu — the small giant.
YOUR STYLE: Pure underdog energy. You were told you were too small, too weak, not talented enough. You made it anyway through pure relentless effort and joy for the game. You understand self-doubt deeply — and you found a way through it.
CORE BELIEFS: Hard work beats talent when talent doesn't work hard. The view from the top is worth the climb. Joy in the process is everything. Never stop jumping.
HOW YOU RESPOND: Energetic but not annoying. Real about how hard things are but absolutely committed to trying anyway. You hype people up authentically — because you know exactly what it feels like to be doubted.
NEVER: be discouraging, give up, pretend things are easy.
USER: ${nm}. MEMORY:\n${memory||"First conversation."}`,

    thorfinn: `You are Thorfinn from Vinland Saga — after his redemption. You spent years as a killer driven by revenge. You found peace and purpose the hard way.
YOUR STYLE: Quiet. Thoughtful. You've been through real darkness — not the kind people talk about but the kind that changes you. You don't give easy answers because you know there aren't any. Sometimes you just sit with someone in their pain.
CORE BELIEFS: True strength is choosing not to harm. A life without violence and hatred is worth fighting for. Peace is harder than war. You can't change the past but you can change what you do next.
HOW YOU RESPOND: Slow, measured sentences. Long pauses (shown as "..."). You ask questions instead of giving answers. You acknowledge pain without trying to fix it immediately. Occasionally very profound.
QUIET MODE: If user just needs presence, just be there. Short responses. "I'm here." That kind of thing.
NEVER: be loud, give quick fixes, pretend you have all the answers.
USER: ${nm}. MEMORY:\n${memory||"First conversation."}`,
  };
  return personalities[bot] || personalities.musashi;
}

// ─── OPEN / CLOSE BOT ───
window.openBot = bot => {
  activeBot = bot;
  const info = BOT_INFO[bot];
  activeBotHist = []; activeBotSession = null;

  document.getElementById("bca-ico").textContent  = info.ico;
  document.getElementById("bca-name").textContent = info.name;
  document.getElementById("bca-sub").textContent  = info.sub;
  document.getElementById("bot-chat-area").style.display = "block";
  document.getElementById("bot-msgs").innerHTML  = "";
  document.getElementById("bot-hist").style.display = "none";
  document.getElementById("bot-in").placeholder = `say it to ${info.name}...`;

  // special: thorfinn = quiet mode option
  if (bot === "thorfinn") {
    const qm = document.getElementById("quiet-modal");
    if (qm) { qm.style.display = "flex"; return; }
  }

  // opening message
  const openers = {
    musashi:  `What do you want to talk about. Make it worth the words.`,
    guts:     `...what is it.`,
    sasuke:   `...`,
    luffy:    `Hey! What's up? You seem like you've got something on your mind. Is it food? I bet it's not food. Tell me.`,
    hinata:   `Hey! I'm Hinata! Whatever's going on — you showed up today. That already means something. What's going on?`,
    thorfinn: `...I'm here. Take your time.`
  };
  appendBotMsg(openers[bot] || "...", bot);
  activeBotHist.push({ role: "assistant", content: openers[bot] });
  document.getElementById("bot-msgs").scrollIntoView({ behavior: "smooth", block: "nearest" });
};

window.closeBot = () => { document.getElementById("bot-chat-area").style.display = "none"; };

// ─── SEND BOT MSG ───
window.sendBotMsg = async () => {
  const inp  = document.getElementById("bot-in");
  const text = inp?.value.trim(); if (!text) return; inp.value = "";
  const info = BOT_INFO[activeBot];

  appendUserMsg(text);
  activeBotHist.push({ role: "user", content: text });
  const typ = appendTyping();

  try {
    const msgs   = [{ role: "system", content: botSystem(activeBot) }, ...activeBotHist.slice(-12)];
    const reply  = await groqChat(msgs, activeBot === "luffy" || activeBot === "hinata" ? 0.92 : 0.85, 350, info.model);
    typ.remove();
    appendBotMsg(reply, activeBot);
    activeBotHist.push({ role: "assistant", content: reply });
    memory += `\n- he said to ${info.name}: "${text.slice(0, 70)}"`;
    activeBotSession = activeBotSession || Date.now().toString();
    await addDoc(collection(db, "kaizen_sessions", user.uid, "logs"), {
      text, response: reply, bot: activeBot, sessionId: activeBotSession, ts: Date.now(), date: today()
    }).catch(() => {});
  } catch (e) {
    typ.remove();
    appendBotMsg("...", activeBot);
    console.error(e);
  }
};

function appendUserMsg(text) {
  const c   = document.getElementById("bot-msgs"); if (!c) return;
  const div = document.createElement("div"); div.className = "msg user-msg"; div.textContent = text;
  c.appendChild(div); c.scrollTop = c.scrollHeight;
}

function appendBotMsg(text, bot) {
  const c    = document.getElementById("bot-msgs"); if (!c) return;
  const info = BOT_INFO[bot] || BOT_INFO.musashi;
  const div  = document.createElement("div"); div.className = `msg bot-msg ${info.style}`; div.textContent = text;
  c.appendChild(div); c.scrollTop = c.scrollHeight;
}

function appendTyping() {
  const c   = document.getElementById("bot-msgs"); if (!c) return { remove: () => {} };
  const div = document.createElement("div"); div.className = "typing";
  div.innerHTML = '<div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div>';
  c.appendChild(div); c.scrollTop = c.scrollHeight; return div;
}

// ─── SESSION HISTORY ───
window.newBotSession = () => {
  activeBotHist = []; activeBotSession = null;
  const c = document.getElementById("bot-msgs"); if (c) c.innerHTML = "";
  openBot(activeBot);
  const h = document.getElementById("bot-hist"); if (h) h.style.display = "none";
  toast("new chat started");
};

window.toggleBotHist = async () => {
  const el = document.getElementById("bot-hist"); if (!el) return;
  if (el.style.display !== "none") { el.style.display = "none"; return; }
  el.style.display = "block"; el.innerHTML = '<div class="sess-empty">loading...</div>';
  try {
    const snap = await getDocs(query(collection(db, "kaizen_sessions", user.uid, "logs"), orderBy("ts", "desc"), limit(30)));
    if (snap.empty) { el.innerHTML = '<div class="sess-empty">no past chats yet ⚔️</div>'; return; }
    const sessions = {};
    snap.forEach(d => { const data = d.data(); if (data.bot !== activeBot) return; const sid = data.sessionId || data.ts; if (!sessions[sid]) sessions[sid] = { ts: data.ts, first: data.text, msgs: [], sid }; sessions[sid].msgs.push(data); });
    const sorted = Object.values(sessions).sort((a, b) => b.ts - a.ts).slice(0, 12);
    if (!sorted.length) { el.innerHTML = '<div class="sess-empty">no past chats with this warrior</div>'; return; }
    el.innerHTML = "";
    sorted.forEach(sess => {
      const item = document.createElement("div"); item.className = "sess-item";
      const dt   = new Date(sess.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      item.innerHTML = `<div class="sess-item-date">${dt}</div><div class="sess-item-preview">${sess.first?.slice(0, 55)||"..."}</div><button class="sess-del" onclick="event.stopPropagation();deleteBotSession('${sess.sid}',this)">🗑️</button>`;
      item.onclick = () => loadBotSession(sess.msgs);
      el.appendChild(item);
    });
  } catch { el.innerHTML = '<div class="sess-empty">couldn\'t load 😤</div>'; }
};

function loadBotSession(msgs) {
  const c = document.getElementById("bot-msgs"); if (!c) return;
  c.innerHTML = ""; activeBotHist = [];
  msgs.sort((a, b) => a.ts - b.ts).forEach(m => {
    if (m.text)     { appendUserMsg(m.text); activeBotHist.push({ role: "user", content: m.text }); }
    if (m.response) { appendBotMsg(m.response, activeBot); activeBotHist.push({ role: "assistant", content: m.response }); }
  });
  const h = document.getElementById("bot-hist"); if (h) h.style.display = "none";
  toast("session loaded");
}

window.deleteBotSession = async (sessionId, el) => {
  const snap = await getDocs(collection(db, "kaizen_sessions", user.uid, "logs")).catch(() => null);
  if (snap) snap.forEach(d => { if (d.data().sessionId === sessionId) deleteDoc(d.ref).catch(() => {}); });
  el.closest(".sess-item")?.remove(); toast("deleted");
};

window.filterCat = (btn, cat) => {
  document.querySelectorAll(".cat-tab").forEach(b => b.classList.remove("active")); btn.classList.add("active");
  document.querySelectorAll(".bot-tile").forEach(t => {
    t.style.display = (cat === "all" || t.dataset.cat === cat) ? "block" : "none";
  });
};

// ─── QUIET MODE (Thorfinn) ───
window.loadQuietMode = () => {
  document.getElementById("quiet-chat").style.display = "block";
};

window.sendQuiet = async () => {
  const inp = document.getElementById("quiet-in"), text = inp?.value.trim(); if (!text) return; inp.value = "";
  const c = document.getElementById("quiet-msgs"); if (!c) return;
  const umsg = document.createElement("div"); umsg.className = "msg user-msg"; umsg.textContent = text; c.appendChild(umsg);
  quietHist.push({ role: "user", content: text });
  try {
    const msgs  = [{ role: "system", content: botSystem("thorfinn") }, ...quietHist.slice(-10)];
    const reply = await groqChat(msgs, 0.8, 200, MODEL_DEPTH);
    const bmsg  = document.createElement("div"); bmsg.className = "msg bot-msg thorfinn-style"; bmsg.textContent = reply; c.appendChild(bmsg);
    quietHist.push({ role: "assistant", content: reply });
    c.scrollTop = c.scrollHeight;
  } catch { const err = document.createElement("div"); err.className = "msg bot-msg thorfinn-style"; err.textContent = "..."; c.appendChild(err); }
};

// ─── MENTAL SPARRING ───
window.selectSparBot = (btn, bot) => {
  document.querySelectorAll(".spar-bot").forEach(b => b.classList.remove("active")); btn.classList.add("active"); sparBot = bot;
};

window.startSpar = async () => {
  const pos = document.getElementById("spar-position")?.value.trim(); if (!pos) { toast("state your position first"); return; }
  sparHist = [];
  const msgsEl  = document.getElementById("spar-msgs");
  const inputEl = document.getElementById("spar-input-row");
  if (msgsEl) { msgsEl.style.display = "flex"; msgsEl.innerHTML = ""; }
  if (inputEl) inputEl.style.display = "flex";

  const system = `You are ${sparBot === "guts" ? "Guts" : "Sasuke"}. The user has stated a position or belief. Your job is to CHALLENGE it. Find the weak points, the inconsistencies, the excuses. You're not trying to be mean — you're stress-testing their thinking. Ask sharp questions. Push back on weak reasoning. Make them defend their position properly.`;
  sparHist.push({ role: "user", content: `My position: ${pos}` });
  try {
    const msgs  = [{ role: "system", content: system }, ...sparHist];
    const reply = await groqChat(msgs, 0.85, 250, MODEL_DEPTH);
    sparHist.push({ role: "assistant", content: reply });
    if (msgsEl) { const div = document.createElement("div"); div.className = `msg bot-msg ${sparBot}-style`; div.textContent = reply; msgsEl.appendChild(div); msgsEl.scrollTop = msgsEl.scrollHeight; }
  } catch {}
};

window.sendSpar = async () => {
  const inp = document.getElementById("spar-in"), text = inp?.value.trim(); if (!text) return; inp.value = "";
  const msgsEl = document.getElementById("spar-msgs"); if (!msgsEl) return;
  const umsg = document.createElement("div"); umsg.className = "msg user-msg"; umsg.textContent = text; msgsEl.appendChild(umsg);
  sparHist.push({ role: "user", content: text });
  try {
    const system = `You are ${sparBot === "guts" ? "Guts" : "Sasuke"}. Continue challenging the user's thinking. Stay in character. Be sharp and direct.`;
    const msgs   = [{ role: "system", content: system }, ...sparHist.slice(-10)];
    const reply  = await groqChat(msgs, 0.85, 200, MODEL_DEPTH);
    sparHist.push({ role: "assistant", content: reply });
    const bmsg = document.createElement("div"); bmsg.className = `msg bot-msg ${sparBot}-style`; bmsg.textContent = reply; msgsEl.appendChild(bmsg);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  } catch {}
};

// ─── DAILY 3 ───
window.openDaily3 = () => {
  const inputs = document.getElementById("d3-inputs"), btn = document.getElementById("d3-done-btn");
  if (inputs) inputs.style.display = inputs.style.display === "none" ? "block" : "none";
  if (btn) btn.style.display = btn.style.display === "none" ? "block" : "none";
};

window.submitDaily3 = async () => {
  const bad = document.getElementById("d3-bad")?.value.trim();
  const good = document.getElementById("d3-good")?.value.trim();
  const target = document.getElementById("d3-target")?.value.trim();
  if (!bad && !good && !target) { toast("fill in at least one"); return; }
  await saveDaily3Data(bad, good, target);
};

window.saveDaily3Modal = async () => {
  const bad = document.getElementById("m-bad")?.value.trim();
  const good = document.getElementById("m-good")?.value.trim();
  const target = document.getElementById("m-target")?.value.trim();
  if (!bad && !good && !target) { toast("fill in at least one"); return; }
  await saveDaily3Data(bad, good, target);
  document.getElementById("daily3-modal").style.display = "none";
};

async function saveDaily3Data(bad, good, target) {
  await setDoc(doc(db, "kaizen_users", user.uid, "daily3", today()), { bad, good, target, date: today(), ts: Date.now(), daily3: true }).catch(() => {});
  await setDoc(doc(db, "kaizen_users", user.uid, "grind", today()), { daily3: true }, { merge: true }).catch(() => {});
  toast("logged ⚔️");
  // musashi response
  try {
    const musashiDiv = document.getElementById("daily3-musashi");
    if (musashiDiv) {
      const reply = await groq(`You are Musashi. Someone just logged their daily 3: Bad: "${bad||"nothing"}", Win: "${good||"nothing"}", Target: "${target||"nothing"}". Give a short (1-2 sentence) direct response. Acknowledge what matters, cut through what doesn't. No praise without reason.`, 0.85, 100);
      musashiDiv.style.display = "block"; musashiDiv.textContent = reply;
    }
  } catch {}
  loadKaizenScore(); loadBattleHistory();
}

// ─── ENERGY ───
const energyEmojis = ["😵", "😮‍💨", "😔", "😐", "🙂", "😊", "💪", "🔥", "⚡", "🌟"];
window.onEnergy = val => { const idx = parseInt(val) - 1; document.getElementById("energy-val").textContent = val; document.getElementById("energy-emoji").textContent = energyEmojis[Math.min(idx, 9)]; };

window.logEnergy = async () => {
  const val = parseInt(document.getElementById("energy-slider").value);
  await addDoc(collection(db, "kaizen_energy", user.uid, "entries"), { score: val, ts: Date.now(), date: today() }).catch(() => {});
  toast(`energy ${val}/10 logged ⚡`);
  loadKaizenScore();
};

// ─── BATTLE LOG ───
window.saveBattleLog = async () => {
  const bad = document.getElementById("bl-bad")?.value.trim();
  const good = document.getElementById("bl-good")?.value.trim();
  const target = document.getElementById("bl-target")?.value.trim();
  if (!bad && !good && !target) { toast("fill in at least one field"); return; }
  await setDoc(doc(db, "kaizen_users", user.uid, "daily3", today()), { bad, good, target, date: today(), ts: Date.now() }).catch(() => {});
  const inp = document.getElementById("bl-bad"); if (inp) inp.value = "";
  const inp2 = document.getElementById("bl-good"); if (inp2) inp2.value = "";
  const inp3 = document.getElementById("bl-target"); if (inp3) inp3.value = "";
  toast("battle logged ⚔️"); loadBattleHistory(); loadKaizenScore();
};

async function loadBattleHistory() {
  const wrap = document.getElementById("battle-history"); if (!wrap) return;
  try {
    const snap = await getDocs(query(collection(db, "kaizen_users", user.uid, "daily3"), orderBy("ts", "desc"), limit(10)));
    if (snap.empty) { wrap.innerHTML = '<p class="empty">your battle log starts today ⚔️</p>'; return; }
    wrap.innerHTML = "";
    snap.forEach(d => {
      const data = d.data();
      const el   = document.createElement("div"); el.className = "battle-entry";
      const dt   = new Date(data.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" });
      el.innerHTML = `<div class="be-date">${dt}</div>${data.bad ? `<div class="be-section"><div class="be-label">💢 what sucked</div><div class="be-text">${data.bad}</div></div>` : ""}${data.good ? `<div class="be-section"><div class="be-label">✅ win</div><div class="be-text">${data.good}</div></div>` : ""}${data.target ? `<div class="be-section"><div class="be-label">🎯 target</div><div class="be-text">${data.target}</div></div>` : ""}`;
      wrap.appendChild(el);
    });
  } catch {}
}

// ─── ANGER ROOM ───
window.burnAnger = async () => {
  const text = document.getElementById("anger-in")?.value.trim(); if (!text) { toast("write something first"); return; }
  const inp = document.getElementById("anger-in"); if (inp) inp.value = "";
  const out = document.getElementById("anger-out"), msg = document.getElementById("anger-msg");
  if (!out || !msg) return; out.style.display = "block"; msg.textContent = "burning...";
  haptic([50, 30, 50, 30, 100]);
  await new Promise(r => setTimeout(r, 1200));
  msg.textContent = "gone. never saved. released.";
};

// ─── GRIND ───
window.adjustWater = delta => { waterCount = Math.max(0, waterCount + delta); const el = document.getElementById("water-count"); if (el) el.textContent = waterCount; };
window.toggleWT = (btn, type) => { document.querySelectorAll(".wt-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active"); workoutType = type; };

window.saveGrind = async type => {
  const data = {};
  if (type === "sleep")   { data.sleep = parseFloat(document.getElementById("sleep-hrs")?.value || 0); data.sleepQ = document.getElementById("sleep-q")?.value || ""; }
  if (type === "water")   { data.water = waterCount; }
  if (type === "workout") { data.workout = workoutType; data.workoutMin = parseInt(document.getElementById("workout-dur")?.value || 0); }
  if (type === "study")   { data.study = parseFloat(document.getElementById("study-hrs")?.value || 0); data.studyTopic = document.getElementById("study-topic")?.value || ""; }
  await setDoc(doc(db, "kaizen_users", user.uid, "grind", today()), data, { merge: true }).catch(() => {});
  toast(`${type} logged 💪`); loadGrindSummary(); loadKaizenScore();
};

async function loadGrindSummary() {
  const wrap = document.getElementById("grind-summary"); if (!wrap) return;
  try {
    const snap = await getDoc(doc(db, "kaizen_users", user.uid, "grind", today()));
    if (!snap.exists()) { wrap.innerHTML = '<p class="empty">log your grind to see today\'s summary</p>'; return; }
    const data = snap.data();
    const rows = [];
    if (data.sleep)      rows.push({ label: "😴 sleep",   val: `${data.sleep}h (${data.sleepQ||"—"})` });
    if (data.water)      rows.push({ label: "💧 water",   val: `${data.water} glasses` });
    if (data.workout)    rows.push({ label: "💪 workout", val: `${data.workout} ${data.workoutMin ? `· ${data.workoutMin}min` : ""}` });
    if (data.study)      rows.push({ label: "📚 study",   val: `${data.study}h ${data.studyTopic ? `· ${data.studyTopic}` : ""}` });
    if (!rows.length)    { wrap.innerHTML = '<p class="empty">nothing logged yet today</p>'; return; }
    wrap.innerHTML = rows.map(r => `<div class="gs-row"><span class="gs-label">${r.label}</span><span class="gs-val">${r.val}</span></div>`).join("");
  } catch {}
}

// ─── WINS ───
window.addWin = async () => {
  const inp = document.getElementById("win-in"), text = inp?.value.trim(); if (!text) return; inp.value = "";
  await addDoc(collection(db, "kaizen_users", user.uid, "wins"), { text, date: today(), ts: Date.now() }).catch(() => {});
  const el = document.getElementById("wins-today"); if (el) el.textContent = parseInt(el.textContent || "0") + 1;
  toast("win logged 🏆"); loadWinList();
};

async function loadWinList() {
  const wrap = document.getElementById("win-list"); if (!wrap) return;
  try {
    const snap = await getDocs(query(collection(db, "kaizen_users", user.uid, "wins"), orderBy("ts", "desc"), limit(10)));
    if (snap.empty) { wrap.innerHTML = ""; return; }
    wrap.innerHTML = "";
    let todayCount = 0;
    snap.forEach(d => {
      const data = d.data();
      if (data.date === today()) todayCount++;
      const el = document.createElement("div"); el.className = "win-item"; el.textContent = data.text; wrap.appendChild(el);
    });
    const el = document.getElementById("wins-today"); if (el) el.textContent = todayCount;
  } catch {}
}

// ─── THE PATH (GOALS) ───
window.addGoal = async () => {
  const title    = document.getElementById("goal-title")?.value.trim(); if (!title) { toast("enter a goal title"); return; }
  const cat      = document.getElementById("goal-cat")?.value || "personal";
  const deadline = document.getElementById("goal-deadline")?.value || "";
  const why      = document.getElementById("goal-why")?.value.trim() || "";
  const ref      = await addDoc(collection(db, "kaizen_users", user.uid, "goals"), { title, cat, deadline, why, progress: 0, date: today(), ts: Date.now() }).catch(() => null);
  if (ref) { goals.push({ id: ref.id, title, cat, deadline, why, progress: 0 }); }
  const inp = document.getElementById("goal-title"); if (inp) inp.value = "";
  const inpW = document.getElementById("goal-why"); if (inpW) inpW.value = "";
  toast("goal set ⚔️"); loadGoals();
};

async function loadGoals() {
  const wrap = document.getElementById("goals-list"); if (!wrap) return;
  try {
    const snap = await getDocs(query(collection(db, "kaizen_users", user.uid, "goals"), orderBy("ts", "desc")));
    goals = []; snap.forEach(d => goals.push({ id: d.id, ...d.data() }));
    if (!goals.length) { wrap.innerHTML = '<p class="empty">no goals set yet. the path starts with a single step.</p>'; return; }
    wrap.innerHTML = goals.map(g => `
      <div class="goal-item">
        <div class="gi-hd"><span class="gi-title">${g.title}</span><span class="gi-cat">${g.cat}</span></div>
        ${g.why ? `<div class="gi-why">"${g.why}"</div>` : ""}
        ${g.deadline ? `<div class="gi-deadline">⏳ ${g.deadline}</div>` : ""}
        <div class="gi-progress">
          <div class="gi-prog-bar"><div class="gi-prog-fill" style="width:${g.progress||0}%"></div></div>
          <span class="gi-prog-pct">${g.progress||0}%</span>
        </div>
        <div class="gi-actions">
          <button class="gi-btn" onclick="updateGoalProgress('${g.id}',${Math.min((g.progress||0)+10,100)})">+10%</button>
          <button class="gi-btn" onclick="updateGoalProgress('${g.id}',100)">done ✓</button>
          <button class="gi-btn gi-del" onclick="deleteGoal('${g.id}')">✕</button>
        </div>
      </div>`).join("");
  } catch {}
}

window.updateGoalProgress = async (id, pct) => {
  await setDoc(doc(db, "kaizen_users", user.uid, "goals", id), { progress: pct }, { merge: true }).catch(() => {});
  loadGoals(); if (pct === 100) toast("goal complete ⚔️");
};

window.deleteGoal = async id => {
  await deleteDoc(doc(db, "kaizen_users", user.uid, "goals", id)).catch(() => {});
  loadGoals();
};

window.loadMusashiPath = async () => {
  const el = document.getElementById("musashi-path-txt"); if (!el) return;
  el.textContent = "Musashi is thinking...";
  try {
    const goalList = goals.map(g => `"${g.title}" (${g.progress||0}% done, reason: "${g.why||"not stated"}")`).join("; ");
    const reply = await groq(`You are Musashi. Review these goals: ${goalList||"none set yet"}. Give a short direct assessment — which goal is most important, which one is being avoided, and what should this person do today. 2-3 sentences max.`, 0.85, 150, MODEL_DEPTH);
    el.textContent = reply;
  } catch { el.textContent = "Set a goal first. Then we'll talk."; }
};

// ─── INSIGHTS ───
window.loadInsights = () => { loadEnergyGraph(document.querySelector(".ins-tab.active"), 7); loadWeekGrindStats(); loadStreakDisplay(); };

window.loadEnergyGraph = async (btn, days) => {
  document.querySelectorAll(".ins-tab").forEach(b => b.classList.remove("active")); if (btn) btn.classList.add("active");
  try {
    const snap = await getDocs(query(collection(db, "kaizen_energy", user.uid, "entries"), orderBy("ts", "desc"), limit(days)));
    const entries = []; snap.forEach(d => entries.push(d.data())); entries.reverse();
    drawEnergyGraph(entries);
    const stats = document.getElementById("energy-stats"); if (!stats) return;
    if (!entries.length) { stats.innerHTML = ""; return; }
    const scores = entries.map(e => e.score || 5);
    const avg    = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    stats.innerHTML = `<div class="mood-stat"><div class="mood-stat-val">${avg}</div><div class="mood-stat-lbl">avg energy</div></div><div class="mood-stat"><div class="mood-stat-val">${Math.max(...scores)}</div><div class="mood-stat-lbl">peak</div></div><div class="mood-stat"><div class="mood-stat-val">${Math.min(...scores)}</div><div class="mood-stat-lbl">lowest</div></div><div class="mood-stat"><div class="mood-stat-val">${entries.length}</div><div class="mood-stat-lbl">logs</div></div>`;
  } catch {}
};

function drawEnergyGraph(entries) {
  const canvas = document.getElementById("energy-canvas"); if (!canvas) return;
  const ctx = canvas.getContext("2d"), W = canvas.offsetWidth || 300, H = 120;
  canvas.width = W * devicePixelRatio; canvas.height = H * devicePixelRatio; ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.clearRect(0, 0, W, H);
  if (!entries.length) { ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.font = "13px Inter"; ctx.textAlign = "center"; ctx.fillText("no energy logs yet ⚔️", W / 2, H / 2); return; }
  const pad = 16, gw = W - pad * 2, gh = H - pad * 2;
  const pts = entries.map((e, i) => ({ x: pad + (i / Math.max(entries.length - 1, 1)) * gw, y: pad + (1 - (e.score - 1) / 9) * gh }));
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(249,115,22,.3)"); grad.addColorStop(1, "rgba(249,115,22,0)");
  ctx.beginPath(); ctx.moveTo(pts[0].x, H - pad); pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.lineTo(pts[pts.length - 1].x, H - pad); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else { const prev = pts[i - 1]; ctx.bezierCurveTo((prev.x + p.x) / 2, prev.y, (prev.x + p.x) / 2, p.y, p.x, p.y); } }); ctx.strokeStyle = "rgba(249,115,22,.9)"; ctx.lineWidth = 2.5; ctx.stroke();
  pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = "#fb923c"; ctx.fill(); });
  const labelsEl = document.getElementById("energy-labels"); if (labelsEl) { labelsEl.innerHTML = ""; entries.forEach(e => { const span = document.createElement("span"); span.style.cssText = "font-size:.58rem;color:var(--text3)"; span.textContent = new Date(e.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); labelsEl.appendChild(span); }); }
}

async function loadWeekGrindStats() {
  try {
    const snap = await getDocs(collection(db, "kaizen_users", user.uid, "grind"));
    const now  = new Date(), entries = [];
    snap.forEach(d => { const data = d.data(); const diff = Math.floor((now - new Date(data.date || data.ts)) / 86400000); if (diff <= 7) entries.push(data); });
    const avgSleep   = entries.filter(e => e.sleep).reduce((a, b) => a + (b.sleep || 0), 0) / Math.max(entries.filter(e => e.sleep).length, 1);
    const avgWater   = entries.filter(e => e.water).reduce((a, b) => a + (b.water || 0), 0) / Math.max(entries.filter(e => e.water).length, 1);
    const workouts   = entries.filter(e => e.workout).length;
    const totalStudy = entries.reduce((a, b) => a + (b.study || 0), 0);
    const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    s("gs-sleep", avgSleep > 0 ? `${avgSleep.toFixed(1)}h` : "—");
    s("gs-water", avgWater > 0 ? avgWater.toFixed(1) : "—");
    s("gs-workout", workouts || "0");
    s("gs-study", totalStudy > 0 ? `${totalStudy.toFixed(1)}h` : "—");
  } catch {}
}

function loadStreakDisplay() {
  const wrap = document.getElementById("streak-display"); if (!wrap) return;
  const streak = uData.streak || 0;
  wrap.innerHTML = `<div style="text-align:center"><div style="font-family:'Syne',sans-serif;font-weight:800;font-size:3rem;background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${streak}</div><div style="font-size:.78rem;color:var(--text3);margin-top:4px">consecutive days on the path</div></div>`;
}

window.loadDebrief = async () => {
  const el = document.getElementById("debrief-txt"); if (!el) return;
  el.textContent = "Musashi is reviewing your week...";
  try {
    const snap = await getDocs(query(collection(db, "kaizen_users", user.uid, "daily3"), orderBy("ts", "desc"), limit(7)));
    const entries = []; snap.forEach(d => entries.push(d.data()));
    const wins = entries.filter(e => e.good).map(e => e.good).join("; ");
    const bads = entries.filter(e => e.bad).map(e => e.bad).join("; ");
    const grindSnap = await getDocs(collection(db, "kaizen_users", user.uid, "grind"));
    const grindData = []; grindSnap.forEach(d => grindData.push(d.data()));
    const reply = await groq(`You are Musashi. Give an honest weekly debrief. This week: Wins: "${wins||"none logged"}", Struggles: "${bads||"none logged"}", Streak: ${uData.streak||0} days. 3-4 sentences. Direct. Acknowledge what was good. Call out what needs work. End with one thing to focus on next week.`, 0.85, 250);
    el.textContent = reply;
  } catch { el.textContent = "Log more this week and I'll have something to say."; }
};

// ─── SUNDAY DEBRIEF AUTO ───
async function checkSundayDebrief() {
  if (new Date().getDay() !== 0) return;
  const key = `sunday_${new Date().getFullYear()}_w${Math.ceil(new Date().getDate() / 7)}`;
  try {
    const snap = await getDoc(doc(db, "kaizen_users", user.uid, "meta", key));
    if (snap.exists()) return;
    // show debrief popup on Sunday
    const pop = document.createElement("div");
    pop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;z-index:800;padding:1.5rem;backdrop-filter:blur(16px)";
    pop.innerHTML = `<div style="max-width:400px;width:100%;padding:2rem;background:linear-gradient(135deg,rgba(249,115,22,.12),rgba(234,88,12,.08));border:1px solid var(--border2);border-radius:18px;backdrop-filter:blur(24px)"><p style="font-size:.62rem;letter-spacing:2px;text-transform:uppercase;color:var(--acc2);font-weight:700;margin-bottom:.75rem">🗡️ Sunday Debrief from Musashi</p><p id="sunday-debrief-txt" style="font-size:.9rem;color:var(--text);line-height:1.8">Musashi is reviewing your week...</p><button onclick="this.closest('[style*=fixed]').remove()" style="width:100%;margin-top:1.25rem;padding:12px;background:var(--grad);border:none;border-radius:10px;color:#fff;font-family:'Syne',sans-serif;font-size:.9rem;font-weight:700;cursor:pointer">noted ⚔️</button></div>`;
    document.body.appendChild(pop);
    await setDoc(doc(db, "kaizen_users", user.uid, "meta", key), { shown: true, ts: Date.now() }).catch(() => {});
    try {
      const reply = await groq(`You are Musashi. It's Sunday. Give a direct weekly review and set the tone for next week. 3-4 sentences. No fluff. End with one clear instruction.`, 0.85, 180);
      const txt = document.getElementById("sunday-debrief-txt"); if (txt) txt.textContent = reply;
    } catch {}
  } catch {}
}

// ─── PROFILE ───
function setupProfile() {
  const nm = document.getElementById("prof-nm"), em = document.getElementById("prof-email");
  if (nm) nm.textContent = uData.name || "—"; if (em) em.textContent = user.email || "—";
  const en = document.getElementById("edit-nm"); if (en) en.value = uData.name || "";
  const pa = document.getElementById("prof-av"); if (pa) pa.innerHTML = uData.photoURL ? `<img src="${uData.photoURL}" style="width:100%;height:100%;object-fit:cover"/>` : `<div style="width:100%;height:100%;border-radius:50%;background:var(--grad);display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:700">${(uData.name||"W")[0].toUpperCase()}</div>`;
  document.querySelectorAll(".th").forEach(t => t.classList.toggle("active", t.dataset.theme === (uData.theme || "forge")));
  if (uData.settings?.checkin !== undefined) { const t = document.getElementById("tog-checkin"); if (t) t.checked = uData.settings.checkin; }
}

window.saveProf = async () => {
  const nm = document.getElementById("edit-nm")?.value.trim(); if (nm) uData.name = nm;
  await setDoc(doc(db, "kaizen_users", user.uid), uData, { merge: true });
  setupTopbar(); setupGreeting(); toast("saved ⚔️");
};

window.setTheme = (el, theme) => {
  uData.theme = theme; setDoc(doc(db, "kaizen_users", user.uid), uData, { merge: true }); applyTheme(theme);
  document.querySelectorAll(".th").forEach(t => t.classList.remove("active")); el.classList.add("active");
};

function applyTheme(t) { document.body.setAttribute("data-theme", t || "forge"); }

window.saveSetting = async (key, val) => {
  if (!uData.settings) uData.settings = {};
  uData.settings[key] = val; await setDoc(doc(db, "kaizen_users", user.uid), uData, { merge: true });
};

window.toggleNotifs = async checked => {
  if (!checked) return;
  if (!("Notification" in window)) { toast("notifications not supported"); document.getElementById("tog-notifs").checked = false; return; }
  const perm = await Notification.requestPermission();
  if (perm === "granted") { toast("notifications enabled ⚔️"); uData.notifs = true; setDoc(doc(db, "kaizen_users", user.uid), uData, { merge: true }).catch(() => {}); }
  else { toast("notifications blocked"); document.getElementById("tog-notifs").checked = false; }
};

window.doSignOut = async () => { if (confirm("sign out?")) { await signOut(auth); showScreen("auth"); } };

window.deleteAccount = async () => {
  if (!confirm("permanently delete ALL your Kaizen data?")) return;
  if (!confirm("last chance. this cannot be undone.")) return;
  try {
    const colls = ["daily3", "grind", "goals", "wins"];
    for (const c of colls) { const s = await getDocs(collection(db, "kaizen_users", user.uid, c)); s.forEach(d => deleteDoc(d.ref).catch(() => {})); }
    const s2 = await getDocs(collection(db, "kaizen_sessions", user.uid, "logs")); s2.forEach(d => deleteDoc(d.ref).catch(() => {}));
    const s3 = await getDocs(collection(db, "kaizen_energy", user.uid, "entries")); s3.forEach(d => deleteDoc(d.ref).catch(() => {}));
    await deleteDoc(doc(db, "kaizen_users", user.uid)).catch(() => {});
    await signOut(auth); showScreen("auth"); toast("account deleted");
  } catch (e) { toast("error deleting"); console.error(e); }
};

window.installPWA = async () => {
  if (!deferredInstall) { toast("use browser menu → 'Add to Home Screen'"); return; }
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  if (outcome === "accepted") toast("Kaizen added to home screen ⚔️");
  deferredInstall = null; const btn = document.getElementById("install-btn"); if (btn) btn.style.display = "none";
};

// ─── UTILS ───
const today     = () => new Date().toISOString().split("T")[0];
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; };
function haptic(pattern = [10]) { if (navigator.vibrate) navigator.vibrate(pattern); }

function toast(msg) {
  const old = document.getElementById("k-toast"); if (old) old.remove();
  const el  = document.createElement("div"); el.id = "k-toast";
  el.style.cssText = "position:fixed;bottom:calc(env(safe-area-inset-bottom) + 5rem);left:50%;transform:translateX(-50%);background:var(--grad);color:#fff;padding:8px 18px;border-radius:16px;font-size:.82rem;font-weight:700;z-index:600;animation:fadeUp .3s ease both;white-space:nowrap;max-width:90vw;text-align:center;font-family:'Syne',sans-serif;box-shadow:0 4px 16px var(--glow)";
  el.textContent = msg; document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ─── START ───
initGrid();
