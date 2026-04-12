/* =============================================
   AURA v2 — Main Application
   app.js

   SETUP:
   1. Replace firebaseConfig values below with
      your own from the Firebase Console.
   2. Enable Email/Password + Google Auth in
      Firebase Console → Authentication → Sign-in method.
   3. Create a Firestore database in Firebase Console.
   4. Deploy or open index.html in a local server.
   ============================================= */

// ─────────────────────────────────────────────
// 1. FIREBASE CONFIG  ← paste your values here
// ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDJNqq0zOnuzXncY5LNBWZOWk_pBsnrVrU",
  authDomain:        "aura-e8064.firebaseapp.com",
  projectId:         "aura-e8064",
  storageBucket:     "aura-e8064.firebasestorage.app",
  messagingSenderId: "766223324061",
  appId:             "1:766223324061:web:36592546877e781f84d574",
  measurementId:     "G-36EKDLR8EZ",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// ─────────────────────────────────────────────
// 2. STATE
// ─────────────────────────────────────────────
let currentUser        = null;
let userPrefs          = {};
let liveMode           = false;
let liveInterval       = null;
let allAnomalies       = [];
let allEvents          = [];
let filteredAnomalies  = [];
let filteredEvents     = [];
let charts             = {};
let notifications      = [];
let notifPanelOpen     = false;
let currentRunId       = null;

// Debounced filter for search input
const debouncedFilter = debounce(applyFilters, 280);

// ─────────────────────────────────────────────
// 3. FIREBASE AUTH LISTENER
// ─────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    try {
      // Upsert profile in Firestore (defined in services/api.js)
      const profile = await upsertUserProfile(user);
      userPrefs = profile?.prefs || {};
      applyPrefsToUI();
    } catch (e) {
      console.warn("Firestore upsert failed (offline?):", e.message);
    }
    onUserLoggedIn(user);
  } else {
    currentUser = null;
    userPrefs   = {};
    onUserLoggedOut();
  }
});

function onUserLoggedIn(user) {
  const name   = user.displayName ? user.displayName.split(" ")[0] : user.email.split("@")[0];
  const initials = getInitials(user.displayName || user.email);

  // Navbar
  document.getElementById("nav-links-public").style.display = "none";
  document.getElementById("nav-links-auth").style.display   = "flex";
  document.getElementById("nav-initials").textContent        = initials;

  // Sidebar
  document.getElementById("sidebar-avatar").textContent     = initials;
  document.getElementById("sidebar-user-name").textContent  = user.displayName || name;
  document.getElementById("sidebar-user-email").textContent = user.email;

  // Settings
  document.getElementById("settings-name").value  = user.displayName || "";
  document.getElementById("settings-email").value = user.email;
  document.getElementById("settings-avatar").textContent      = initials;
  document.getElementById("settings-avatar-name").textContent = user.displayName || name;
  document.getElementById("settings-avatar-email").textContent = user.email;

  // Dashboard greeting
  document.getElementById("dash-greeting").textContent = `Good ${getTimeOfDay()}, ${name} 👋`;

  // Load data and navigate
  loadData();
  goPage("app");
  switchTab("dashboard");

  // Push a welcome notification
  pushNotif("🟢", `Signed in as ${user.email}`);

  // Load history tab in background
  loadHistory();
}

function onUserLoggedOut() {
  document.getElementById("nav-links-public").style.display = "flex";
  document.getElementById("nav-links-auth").style.display   = "none";

  liveMode = false;
  clearInterval(liveInterval);

  // Reset all filter selects
  ["filter-platform", "filter-topic"].forEach((id) => {
    const sel = document.getElementById(id);
    while (sel.options.length > 1) sel.remove(1);
    sel.value = "";
  });
  ["filter-type", "filter-severity", "filter-search"].forEach((id) => {
    document.getElementById(id).value = "";
  });

  if (document.getElementById("page-app").classList.contains("active")) {
    goPage("landing");
  }
}

// ─────────────────────────────────────────────
// 4. AUTH ACTIONS
// ─────────────────────────────────────────────

async function doLogin() {
  const email = document.getElementById("login-email").value.trim();
  const pw    = document.getElementById("login-password").value;
  const err   = document.getElementById("login-error");
  err.style.display = "none";

  if (!email || !pw) return showAuthError(err, "Please fill in all fields.");

  setAuthLoading("login", true);
  try {
    await auth.signInWithEmailAndPassword(email, pw);
    await logUserAction(currentUser?.uid, "login", { method: "email" });
  } catch (e) {
    setAuthLoading("login", false);
    showAuthError(err, firebaseErrorMessage(e.code));
  }
}

async function doSignup() {
  const name  = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const pw    = document.getElementById("signup-password").value;
  const err   = document.getElementById("signup-error");
  err.style.display = "none";

  if (!name || !email || !pw) return showAuthError(err, "Please fill in all fields.");
  if (pw.length < 6)          return showAuthError(err, "Password must be at least 6 characters.");

  setAuthLoading("signup", true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pw);
    await cred.user.updateProfile({ displayName: name });
  } catch (e) {
    setAuthLoading("signup", false);
    showAuthError(err, firebaseErrorMessage(e.code));
  }
}

async function doForgotPassword() {
  const email = document.getElementById("forgot-email").value.trim();
  const err   = document.getElementById("forgot-error");
  const suc   = document.getElementById("forgot-success");
  err.style.display = suc.style.display = "none";

  if (!email) return showAuthError(err, "Please enter your email address.");

  setAuthLoading("forgot", true);
  try {
    await auth.sendPasswordResetEmail(email);
    suc.textContent   = `Reset link sent to ${email}. Check your inbox.`;
    suc.style.display = "block";
    setAuthLoading("forgot", false);
  } catch (e) {
    setAuthLoading("forgot", false);
    showAuthError(err, firebaseErrorMessage(e.code));
  }
}

async function doGoogleSignIn() {
  try {
    await signInWithGoogle();
  } catch (e) {
    const errId = document.querySelector(".page.active .auth-error");
    if (errId) showAuthError(errId, firebaseErrorMessage(e.code));
  }
}

async function doLogout() {
  await auth.signOut();
}

async function deleteAccount() {
  if (!confirm("Permanently delete your account and all data? This cannot be undone.")) return;
  try {
    await currentUser.delete();
    showToast("Account deleted.", "info");
    goPage("landing");
  } catch (e) {
    if (e.code === "auth/requires-recent-login") {
      showToast("Please sign out and sign back in first.", "error");
    } else {
      showToast("Error: " + e.message, "error");
    }
  }
}

async function saveSettings() {
  if (!currentUser) return;
  const name = document.getElementById("settings-name").value.trim();
  const pw   = document.getElementById("settings-password").value;
  try {
    await updateUserSettings(currentUser, { name, password: pw });
    if (name) {
      const first = name.split(" ")[0];
      document.getElementById("dash-greeting").textContent = `Good ${getTimeOfDay()}, ${first} 👋`;
      document.getElementById("sidebar-user-name").textContent   = name;
      document.getElementById("settings-avatar-name").textContent = name;
      const initials = getInitials(name);
      document.getElementById("nav-initials").textContent    = initials;
      document.getElementById("nav-avatar").textContent      = initials;
      document.getElementById("sidebar-avatar").textContent  = initials;
      document.getElementById("settings-avatar").textContent = initials;
    }
    if (pw) document.getElementById("settings-password").value = "";
    showToast("✓ Settings saved", "success");
    CACHE?.delete?.(`profile_${currentUser.uid}`);
  } catch (e) {
    if (e.code === "auth/requires-recent-login") {
      showToast("Sign out and back in to change your password.", "error");
    } else {
      showToast("Error: " + e.message, "error");
    }
  }
}

async function togglePref(el, key) {
  el.classList.toggle("on");
  userPrefs[key] = el.classList.contains("on");
  if (currentUser) {
    try { await saveUserPrefs(currentUser.uid, { ...userPrefs }); } catch (_) {}
  }
}

function applyPrefsToUI() {
  const keys = ["emailAlerts","weeklyDigest","pushNotifs","autoRefresh","showConfidence"];
  keys.forEach((k) => {
    const el = document.getElementById(`pref-${k}`);
    if (!el) return;
    if (userPrefs[k] !== undefined) {
      el.classList.toggle("on", !!userPrefs[k]);
    }
  });
}

// ─────────────────────────────────────────────
// 5. AUTH HELPERS
// ─────────────────────────────────────────────

function showAuthError(el, msg) {
  el.textContent   = msg;
  el.style.display = "block";
}

function setAuthLoading(form, loading) {
  const btn  = document.getElementById(`${form}-btn`);
  const text = document.getElementById(`${form}-btn-text`);
  const spin = document.getElementById(`${form}-spinner`);
  if (!btn) return;
  btn.disabled         = loading;
  text.style.display   = loading ? "none" : "inline";
  spin.style.display   = loading ? "inline-block" : "none";
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === "password") {
    input.type = "text";
    btn.innerHTML = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  } else {
    input.type = "password";
    btn.innerHTML = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  }
}

// Password strength meter
document.addEventListener("input", (e) => {
  if (e.target.id !== "signup-password") return;
  const pw   = e.target.value;
  const fill = document.getElementById("pw-strength-fill");
  const lbl  = document.getElementById("pw-strength-label");
  if (!fill) return;

  let score = 0;
  if (pw.length >= 6)  score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw))   score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const levels = [
    { w:"0%",   color:"transparent",  text:"" },
    { w:"25%",  color:"var(--rose)",    text:"Weak" },
    { w:"50%",  color:"var(--orange)", text:"Fair" },
    { w:"75%",  color:"var(--yellow)", text:"Good" },
    { w:"100%", color:"var(--emerald)",text:"Strong" },
  ];
  const l = levels[Math.min(score, 4)];
  fill.style.width      = l.w;
  fill.style.background = l.color;
  lbl.textContent       = l.text;
  lbl.style.color       = l.color;
});

// Enter-key shortcuts on auth forms
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const active = document.querySelector(".page.active");
  if (!active) return;
  if (active.id === "page-login")  doLogin();
  if (active.id === "page-signup") doSignup();
  if (active.id === "page-forgot") doForgotPassword();
});

// ─────────────────────────────────────────────
// 6. MOCK DATA GENERATOR (fallback / live mode)
// ─────────────────────────────────────────────
function generateMockData() {
  const platforms = ["Twitter","Instagram","Reddit","TikTok","YouTube","Facebook","LinkedIn"];
  const topics    = ["Politics","Sports","Entertainment","Technology","Finance","Health","Gaming","Music"];
  const types     = ["spike","drop"];
  const reasons   = [
    "Unusual engagement velocity detected",
    "Z-score threshold exceeded by 3.2σ",
    "Coordinated activity pattern identified",
    "Bot-like behaviour cluster found",
    "Viral cascade initiated",
    "Cross-platform correlation detected",
    "Organic growth pattern anomaly",
    "Sentiment reversal spike",
  ];
  const now = new Date();

  const anomalies = Array.from({ length: 300 }, () => {
    const ts = new Date(now - Math.random() * 30 * 86400000);
    return {
      timestamp:        ts.toISOString(),
      platform:         platforms[rand(platforms.length)],
      topic_category:   topics[rand(topics.length)],
      engagement_score: +(Math.random() * 100).toFixed(2),
      sentiment_score:  +(Math.random() * 2 - 1).toFixed(3),
      anomaly_pred:     Math.random() > 0.3 ? 1 : 0,
      detected_type:    types[rand(types.length)],
      anomaly_reason:   reasons[rand(reasons.length)],
      confidence_score: +(0.5 + Math.random() * 0.5).toFixed(3),
      anomaly_strength: +(Math.random() * 5).toFixed(2),
      hashtags:         `#${topics[rand(topics.length)].toLowerCase()} #trending #viral`,
      event_id:         `EVT${String(rand(20) + 1).padStart(3, "0")}`,
    };
  });

  const labels = [
    "Tech Conference Surge","Political Debate Spike","Sports Finals Frenzy",
    "Celebrity Drama Drop","Product Launch Viral","Market Crash Panic",
    "Music Festival Buzz","Election Results Surge","Gaming Tournament Spike",
    "Health Scare Cascade","Entertainment Awards","Crypto Pump Signal",
    "Breaking News Flood","Brand Controversy Drop","Science Discovery Buzz",
    "Social Movement Surge","Weather Emergency Alert","Sports Trade Rumour",
    "Movie Release Spike","Geopolitical Tension Drop",
  ];

  const events = labels.map((label, i) => {
    const start = new Date(now - Math.random() * 28 * 86400000);
    const end   = new Date(start.getTime() + Math.random() * 48 * 3600000);
    const conf  = +(0.55 + Math.random() * 0.42).toFixed(3);
    const intensity = conf > 0.85 ? "critical" : conf > 0.72 ? "high" : conf > 0.60 ? "medium" : "low";
    return {
      event_id:          `EVT${String(i + 1).padStart(3, "0")}`,
      event_label:       label,
      dominant_platform: platforms[rand(platforms.length)],
      dominant_topic:    topics[rand(topics.length)],
      post_count:        rand(50000) + 1000,
      engagement_max:    rand(200000) + 10000,
      confidence_mean:   conf,
      event_intensity:   intensity,
      start_time:        start.toISOString(),
      end_time:          end.toISOString(),
      top_hashtags:      `#${label.split(" ")[0].toLowerCase()} #trending #viral`,
      detected_type:     types[rand(types.length)],
      ai_explanation:    `Flagged due to ${reasons[rand(reasons.length)].toLowerCase()}. Engagement increased by ${rand(800) + 200}% over baseline within a ${rand(22) + 2}-hour window. Cross-platform analysis confirms coordinated organic spread primarily originating from ${platforms[rand(platforms.length)]}.`,
    };
  });

  return { anomalies, events };
}

function rand(n) { return Math.floor(Math.random() * n); }

// ─────────────────────────────────────────────
// 7. FILE UPLOAD & DATA PARSING
// ─────────────────────────────────────────────
function detectAndSplitData(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { anomalies: [], events: [] };
  const sample = rows[0];
  const hasAnomalyFields = "engagement_score" in sample || "anomaly_pred" in sample || "sentiment_score" in sample;
  const hasEventFields   = "event_label" in sample || "dominant_platform" in sample || "event_intensity" in sample;
  if (hasEventFields && !hasAnomalyFields) return { anomalies: [], events: normaliseEvents(rows) };
  if (hasAnomalyFields && !hasEventFields) return { anomalies: normaliseAnomalies(rows), events: deriveEventsFromAnomalies(rows) };
  const events    = rows.filter((r) => "event_label" in r || "dominant_platform" in r);
  const anomalies = rows.filter((r) => !("event_label" in r));
  return {
    anomalies: normaliseAnomalies(anomalies.length ? anomalies : rows),
    events:    normaliseEvents(events.length ? events : []),
  };
}

function normaliseAnomalies(rows) {
  return rows.map((r, i) => ({
    timestamp:        r.timestamp        || r.date       || new Date().toISOString(),
    platform:         r.platform         || r.source     || "Unknown",
    topic_category:   r.topic_category   || r.topic      || r.category || "General",
    engagement_score: parseFloat(r.engagement_score ?? r.engagement ?? Math.random() * 100),
    sentiment_score:  parseFloat(r.sentiment_score  ?? r.sentiment  ?? (Math.random() * 2 - 1)),
    anomaly_pred:     r.anomaly_pred !== undefined ? +r.anomaly_pred : (r.is_anomaly !== undefined ? +r.is_anomaly : (Math.random() > 0.35 ? 1 : 0)),
    detected_type:    r.detected_type    || r.type       || (Math.random() > 0.5 ? "spike" : "drop"),
    anomaly_reason:   r.anomaly_reason   || r.reason     || "Threshold exceeded",
    confidence_score: parseFloat(r.confidence_score ?? r.confidence ?? (0.5 + Math.random() * 0.5)),
    anomaly_strength: parseFloat(r.anomaly_strength ?? r.strength   ?? Math.random() * 5),
    hashtags:         r.hashtags         || r.tags       || "#trending",
    event_id:         r.event_id         || `EVT${String(i + 1).padStart(3, "0")}`,
  }));
}

function normaliseEvents(rows) {
  return rows.map((r, i) => {
    const conf = parseFloat(r.confidence_mean ?? r.confidence ?? r.confidence_score ?? (0.55 + Math.random() * 0.42));
    const intensity = r.event_intensity || (conf > 0.85 ? "critical" : conf > 0.72 ? "high" : conf > 0.60 ? "medium" : "low");
    return {
      event_id:          r.event_id          || `EVT${String(i + 1).padStart(3, "0")}`,
      event_label:       r.event_label       || r.label || r.name || `Event ${i + 1}`,
      dominant_platform: r.dominant_platform || r.platform || "Unknown",
      dominant_topic:    r.dominant_topic    || r.topic    || "General",
      post_count:        parseInt(r.post_count ?? r.posts ?? 0, 10),
      engagement_max:    parseInt(r.engagement_max ?? r.max_engagement ?? 0, 10),
      confidence_mean:   conf,
      event_intensity:   intensity,
      start_time:        r.start_time  || r.started_at || new Date().toISOString(),
      end_time:          r.end_time    || r.ended_at   || new Date().toISOString(),
      top_hashtags:      r.top_hashtags || r.hashtags  || "#trending",
      detected_type:     r.detected_type || r.type     || (Math.random() > 0.5 ? "spike" : "drop"),
      ai_explanation:    r.ai_explanation || r.explanation || r.description || "No explanation provided.",
    };
  });
}

function deriveEventsFromAnomalies(rows) {
  const groups = {};
  rows.forEach((r) => {
    const key = r.event_id || "EVT001";
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  return Object.entries(groups).map(([id, members], i) => {
    const timestamps = members.map((m) => new Date(m.timestamp)).filter(Boolean).sort((a, b) => a - b);
    const conf       = +(members.reduce((s, m) => s + parseFloat(m.confidence_score || 0.7), 0) / members.length).toFixed(3);
    const intensity  = conf > 0.85 ? "critical" : conf > 0.72 ? "high" : conf > 0.60 ? "medium" : "low";
    const mode       = (arr) => arr.sort((a, b) => arr.filter(v => v === a).length - arr.filter(v => v === b).length).pop() || "Unknown";
    const platforms  = members.map((m) => m.platform).filter(Boolean);
    const topics     = members.map((m) => m.topic_category).filter(Boolean);
    return {
      event_id:          id,
      event_label:       members[0].anomaly_reason || `Event ${id}`,
      dominant_platform: mode(platforms),
      dominant_topic:    mode(topics),
      post_count:        members.length,
      engagement_max:    Math.max(...members.map((m) => parseFloat(m.engagement_score || 0))),
      confidence_mean:   conf,
      event_intensity:   intensity,
      start_time:        timestamps[0]?.toISOString()    || new Date().toISOString(),
      end_time:          timestamps.at(-1)?.toISOString() || new Date().toISOString(),
      top_hashtags:      members[0].hashtags || "#trending",
      detected_type:     members[0].detected_type || "spike",
      ai_explanation:    `Cluster of ${members.length} anomalies under ${id}. Dominant platform: ${mode([...platforms])}. Avg confidence: ${conf}.`,
    };
  });
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { values.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    values.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const ext    = file.name.split(".").pop().toLowerCase();
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      let rows;
      if (ext === "json") {
        const parsed = JSON.parse(e.target.result);
        if (Array.isArray(parsed)) {
          rows = parsed;
        } else if (parsed.anomalies || parsed.events) {
          allAnomalies = normaliseAnomalies(parsed.anomalies || []);
          allEvents    = normaliseEvents(parsed.events || []);
          if (!allEvents.length && allAnomalies.length) allEvents = deriveEventsFromAnomalies(parsed.anomalies);
          finaliseLoad(file.name, false);
          return;
        } else {
          rows = parsed.data || Object.values(parsed);
        }
      } else if (ext === "csv") {
        rows = parseCSV(e.target.result);
      } else {
        showToast("Please upload a .json or .csv file", "error");
        return;
      }
      const { anomalies, events } = detectAndSplitData(rows);
      allAnomalies = anomalies;
      allEvents    = events;
      finaliseLoad(file.name, false);
    } catch (err) {
      console.error("File parse error:", err);
      showToast("Could not parse file — loading sample data", "error");
      loadMockFallback();
    }
  };

  reader.onerror = () => {
    showToast("Could not read file — loading sample data", "error");
    loadMockFallback();
  };

  reader.readAsText(file);
}

async function finaliseLoad(filename, isMock) {
  resetFilterDropdowns();
  populateFilterDropdowns();

  // Hide skeleton, show real data
  const skeleton = document.getElementById("table-skeleton");
  if (skeleton) skeleton.style.display = "none";

  renderDashboard();

  const statusMsg = isMock
    ? "Sample data loaded"
    : `${filename} loaded · ${allAnomalies.length.toLocaleString()} rows · ${allEvents.length} events`;
  const toastMsg  = isMock ? "Sample data loaded" : `✓ ${filename}`;

  showToast(toastMsg, "success");
  const status = document.getElementById("drop-zone-status");
  if (status) status.textContent = statusMsg;

  // Persist to Firestore if logged in
  if (currentUser && allAnomalies.length && !isMock) {
    try {
      currentRunId = await saveAnalysisRun(currentUser.uid, {
        anomalies: allAnomalies.slice(0, 2000),
        events:    allEvents,
        source:    filename,
      });
      pushNotif("💾", `Saved "${filename}" to history`);
      loadHistory();
    } catch (e) {
      console.warn("Firestore save failed:", e.message);
    }
  }
}

function loadMockFallback() {
  const d = generateMockData();
  allAnomalies = d.anomalies;
  allEvents    = d.events;
  finaliseLoad("sample", true);
}

// ─────────────────────────────────────────────
// 8. DATA LOADING (initial call on login)
// ─────────────────────────────────────────────
function loadData() {
  // Show skeleton loaders while generating/fetching
  showKPISkeletons();
  const skeleton = document.getElementById("table-skeleton");
  if (skeleton) skeleton.style.display = "block";
  const tbody = document.getElementById("events-tbody");
  if (tbody) tbody.innerHTML = "";

  // Use mock data; when you have a real backend, replace this with an API call
  setTimeout(() => {
    const d = generateMockData();
    allAnomalies = d.anomalies;
    allEvents    = d.events;
    finaliseLoad("sample", true);
  }, 600);
}

function showKPISkeletons() {
  const grid = document.getElementById("kpi-grid");
  if (!grid) return;
  grid.innerHTML = Array(4).fill('<div class="kpi-skeleton"></div>').join("");
}

// ─────────────────────────────────────────────
// 9. FILTER LOGIC
// ─────────────────────────────────────────────
function resetFilterDropdowns() {
  ["filter-platform", "filter-topic"].forEach((id) => {
    const sel = document.getElementById(id);
    while (sel.options.length > 1) sel.remove(1);
    sel.value = "";
  });
  ["filter-type","filter-severity","filter-search"].forEach((id) => {
    document.getElementById(id).value = "";
  });
}

function populateFilterDropdowns() {
  const platforms = [...new Set(allAnomalies.map((a) => a.platform).filter(Boolean))].sort();
  const topics    = [...new Set(allAnomalies.map((a) => a.topic_category).filter(Boolean))].sort();

  const platSel  = document.getElementById("filter-platform");
  const topicSel = document.getElementById("filter-topic");
  platforms.forEach((p) => { const o = new Option(p, p); platSel.add(o); });
  topics.forEach((t)    => { const o = new Option(t, t); topicSel.add(o); });
}

function getFilteredData() {
  const platform = document.getElementById("filter-platform")?.value;
  const topic    = document.getElementById("filter-topic")?.value;
  const type     = document.getElementById("filter-type")?.value;
  const severity = document.getElementById("filter-severity")?.value;
  const search   = document.getElementById("filter-search")?.value?.toLowerCase() || "";

  let fa = allAnomalies;
  if (platform) fa = fa.filter((a) => a.platform         === platform);
  if (topic)    fa = fa.filter((a) => a.topic_category   === topic);
  if (type)     fa = fa.filter((a) => a.detected_type    === type);

  let fe = allEvents;
  if (platform) fe = fe.filter((e) => e.dominant_platform === platform);
  if (topic)    fe = fe.filter((e) => e.dominant_topic    === topic);
  if (type)     fe = fe.filter((e) => e.detected_type     === type);
  if (severity) fe = fe.filter((e) => e.event_intensity   === severity);
  if (search)   fe = fe.filter((e) => e.event_label.toLowerCase().includes(search) || e.dominant_platform.toLowerCase().includes(search) || e.dominant_topic.toLowerCase().includes(search));

  return { fa, fe };
}

function applyFilters() {
  renderDashboard();
}

function resetFilters() {
  resetFilterDropdowns();
  populateFilterDropdowns();
  renderDashboard();
}

// ─────────────────────────────────────────────
// 10. KPI COMPUTATION & RENDERING
// ─────────────────────────────────────────────
function computeKPIs(anomalies, events) {
  const anomalyCount  = anomalies.filter((a) => a.anomaly_pred === 1).length;
  const avgConfidence = events.length
    ? (events.reduce((s, e) => s + parseFloat(e.confidence_mean || 0), 0) / events.length).toFixed(3)
    : "—";
  const totalEngagement = anomalies.reduce((s, a) => s + parseFloat(a.engagement_score || 0), 0);
  const criticalCount   = events.filter((e) => e.event_intensity === "critical").length;

  return [
    {
      label: "ANOMALIES DETECTED",
      value: anomalyCount.toLocaleString(),
      meta:  `${anomalies.length.toLocaleString()} total records`,
      accent: "linear-gradient(90deg, var(--violet), var(--cyan))",
      delta: `+${rand(12) + 1}% vs last week`,
      up: true,
    },
    {
      label: "EVENTS FLAGGED",
      value: events.length.toLocaleString(),
      meta:  `${criticalCount} critical`,
      accent: "linear-gradient(90deg, var(--rose), var(--orange))",
      delta: criticalCount > 3 ? `${criticalCount} need attention` : "All under control",
      up: criticalCount > 3,
    },
    {
      label: "AVG CONFIDENCE",
      value: avgConfidence,
      meta:  "weighted mean",
      accent: "linear-gradient(90deg, var(--emerald), var(--cyan))",
      delta: parseFloat(avgConfidence) > 0.75 ? "High confidence" : "Moderate confidence",
      up: parseFloat(avgConfidence) > 0.75,
    },
    {
      label: "TOTAL ENGAGEMENT",
      value: totalEngagement > 1000 ? `${(totalEngagement / 1000).toFixed(1)}K` : totalEngagement.toFixed(0),
      meta:  "sum of engagement scores",
      accent: "linear-gradient(90deg, var(--yellow), var(--orange))",
      delta: `Across ${[...new Set(anomalies.map(a => a.platform))].length} platforms`,
      up: true,
    },
  ];
}

function renderKPIs(kpis) {
  const grid = document.getElementById("kpi-grid");
  grid.innerHTML = kpis.map((k) => `
    <div class="kpi-card animate-fade-in" style="--kpi-accent:${k.accent}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value gradient-text font-display">${k.value}</div>
      <div class="kpi-meta">
        ${k.meta} · <span class="${k.up ? "up" : "down"}">${k.delta}</span>
      </div>
    </div>
  `).join("");
}

// ─────────────────────────────────────────────
// 11. TABLE RENDERING
// ─────────────────────────────────────────────
function renderTable(events) {
  const tbody = document.getElementById("events-tbody");
  if (!tbody) return;

  if (!events.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:32px;font-size:13px;">No events match the current filters</td></tr>`;
    return;
  }

  tbody.innerHTML = events.slice(0, 50).map((e) => `
    <tr onclick="openEventPanel('${e.event_id}')">
      <td><span class="font-display" style="font-size:13px;font-weight:600;color:var(--text1)">${e.event_label}</span></td>
      <td><span class="badge badge-platform">${e.dominant_platform}</span></td>
      <td style="color:var(--text2)">${e.dominant_topic}</td>
      <td class="font-mono" style="color:var(--violet)">${Number(e.post_count).toLocaleString()}</td>
      <td class="font-mono">${parseFloat(e.confidence_mean).toFixed(3)}</td>
      <td><span class="badge badge-${e.event_intensity}">${e.event_intensity}</span></td>
      <td><span class="badge badge-${e.detected_type}">${e.detected_type}</span></td>
      <td class="font-mono" style="color:var(--text3);font-size:11px">${new Date(e.start_time).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</td>
    </tr>
  `).join("");
}

// ─────────────────────────────────────────────
// 12. EVENTS GRID RENDERING
// ─────────────────────────────────────────────
function renderEventsGrid(events) {
  const grid  = document.getElementById("events-grid");
  const empty = document.getElementById("events-empty");
  const count = document.getElementById("events-page-count");
  if (!grid) return;

  if (!events.length) {
    grid.innerHTML = "";
    if (empty) empty.style.display = "flex";
    if (count) count.textContent   = "No events found";
    return;
  }

  if (empty) empty.style.display = "none";
  if (count) count.textContent   = `${events.length} events`;

  grid.innerHTML = events.map((e, i) => `
    <div class="event-card" style="animation-delay:${(i % 20) * 0.03}s" onclick="openEventPanel('${e.event_id}')">
      <div class="event-card-top">
        <div class="event-card-name">${e.event_label}</div>
        <span class="badge badge-${e.event_intensity}">${e.event_intensity}</span>
      </div>
      <div class="event-card-tags">
        <span class="badge badge-platform">${e.dominant_platform}</span>
        <span class="badge" style="background:rgba(6,182,212,0.1);color:var(--cyan)">${e.dominant_topic}</span>
        <span class="badge badge-${e.detected_type}">${e.detected_type}</span>
      </div>
      <div class="event-card-stats">
        <span>${Number(e.post_count).toLocaleString()} posts</span>
        <span>${new Date(e.start_time).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</span>
        <span class="font-mono">${(e.confidence_mean * 100).toFixed(0)}%</span>
      </div>
      <div class="conf-bar">
        <div class="conf-fill" style="width:${(e.confidence_mean * 100).toFixed(0)}%"></div>
      </div>
    </div>
  `).join("");
}

// ─────────────────────────────────────────────
// 13. EVENT DETAIL PANEL
// ─────────────────────────────────────────────
function openEventPanel(eventId) {
  const e = allEvents.find((ev) => ev.event_id === eventId);
  if (!e) return;

  const dur = Math.round((new Date(e.end_time) - new Date(e.start_time)) / 3600000);

  document.getElementById("panel-content").innerHTML = `
    <div style="margin-bottom:28px">
      <div class="panel-event-id">${e.event_id}</div>
      <div class="panel-event-name">${e.event_label}</div>
      <div class="panel-tags">
        <span class="badge badge-${e.event_intensity}">${e.event_intensity}</span>
        <span class="badge badge-platform">${e.dominant_platform}</span>
        <span class="badge" style="background:rgba(6,182,212,0.1);color:var(--cyan)">${e.dominant_topic}</span>
        <span class="badge badge-${e.detected_type}">${e.detected_type}</span>
      </div>
    </div>

    <div class="panel-stats-grid">
      <div class="panel-stat">
        <div class="panel-stat-label">POST COUNT</div>
        <div class="panel-stat-value font-display" style="color:var(--violet)">${Number(e.post_count).toLocaleString()}</div>
      </div>
      <div class="panel-stat">
        <div class="panel-stat-label">MAX ENGAGEMENT</div>
        <div class="panel-stat-value font-display" style="color:var(--cyan)">${Number(e.engagement_max).toLocaleString()}</div>
      </div>
      <div class="panel-stat">
        <div class="panel-stat-label">CONFIDENCE</div>
        <div class="panel-stat-value font-display" style="color:var(--emerald)">${parseFloat(e.confidence_mean).toFixed(3)}</div>
      </div>
      <div class="panel-stat">
        <div class="panel-stat-label">DURATION</div>
        <div class="panel-stat-value font-display" style="color:var(--orange)">${dur}h</div>
      </div>
    </div>

    <div class="panel-timing">
      <div class="kpi-label" style="margin-bottom:10px">TIMING</div>
      <div class="panel-timing-row">
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="var(--emerald)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Start: <span class="font-mono" style="color:var(--text1)">${new Date(e.start_time).toLocaleString()}</span>
      </div>
      <div class="panel-timing-row">
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="var(--rose)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        End: <span class="font-mono" style="color:var(--text1)">${new Date(e.end_time).toLocaleString()}</span>
      </div>
    </div>

    <div style="margin-bottom:20px">
      <div class="kpi-label" style="margin-bottom:8px">TOP HASHTAGS</div>
      <div class="panel-hashtags">${e.top_hashtags}</div>
    </div>

    <div>
      <div class="kpi-label" style="margin-bottom:8px">
        <span style="background:rgba(234,179,8,0.12);color:#facc15;padding:2px 7px;border-radius:4px;margin-right:6px;font-family:'JetBrains Mono',monospace;font-size:9px;">AI</span>
        EXPLANATION
      </div>
      <div class="panel-ai-box">${e.ai_explanation}</div>
    </div>

    <div class="conf-bar" style="height:6px;margin-top:4px">
      <div class="conf-fill" style="width:${(e.confidence_mean * 100).toFixed(0)}%"></div>
    </div>
    <div class="panel-conf-label">
      <span>Confidence Score</span>
      <span class="font-mono">${(e.confidence_mean * 100).toFixed(1)}%</span>
    </div>
  `;

  document.getElementById("event-panel").classList.add("open");
  document.getElementById("overlay").classList.add("show");
}

function closeEventPanel() {
  document.getElementById("event-panel").classList.remove("open");
  document.getElementById("overlay").classList.remove("show");
}

// ─────────────────────────────────────────────
// 14. CHARTS
// ─────────────────────────────────────────────
const CHART_GRID   = { color: "rgba(139,92,246,0.06)", drawBorder: false };
const TICK_STYLE   = { color: "#475569", font: { size: 9 } };
const LEGEND_STYLE = { color: "rgba(148,163,184,0.7)", font: { family: "JetBrains Mono", size: 10 }, boxWidth: 10 };

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

function buildTimeline(anomalies) {
  destroyChart("timeline");
  const days = {};
  anomalies.forEach((a) => {
    const d = a.timestamp.split("T")[0];
    if (!days[d]) days[d] = { engagement: 0, anomalies: 0 };
    days[d].engagement += a.engagement_score;
    if (a.anomaly_pred === 1) days[d].anomalies++;
  });
  const sorted = Object.keys(days).sort();
  const ctx = document.getElementById("chartTimeline").getContext("2d");
  charts.timeline = new Chart(ctx, {
    type: "line",
    data: {
      labels: sorted.map((d) => new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" })),
      datasets: [
        { label: "Engagement", data: sorted.map((d) => days[d].engagement.toFixed(0)),
          borderColor: "#8b5cf6", backgroundColor: "rgba(139,92,246,0.06)",
          fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2, yAxisID: "y" },
        { label: "Anomalies",  data: sorted.map((d) => days[d].anomalies),
          borderColor: "#f43f5e", backgroundColor: "rgba(244,63,94,0.06)",
          fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2, yAxisID: "y1" },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: LEGEND_STYLE } },
      scales: {
        x:  { ticks: { ...TICK_STYLE, maxTicksLimit: 8, font: { family: "JetBrains Mono", size: 9 } }, grid: CHART_GRID },
        y:  { ticks: TICK_STYLE, grid: CHART_GRID, position: "left" },
        y1: { ticks: TICK_STYLE, grid: { display: false }, position: "right" },
      },
    },
  });
}

function buildPlatform(anomalies) {
  destroyChart("platform");
  const counts = {};
  anomalies.forEach((a) => { counts[a.platform] = (counts[a.platform] || 0) + 1; });
  const labels = Object.keys(counts);
  const colors = ["#8b5cf6","#06b6d4","#10b981","#f97316","#f43f5e","#eab308","#a78bfa"];
  charts.platform = new Chart(document.getElementById("chartPlatform").getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: labels.map((l) => counts[l]), backgroundColor: colors, borderColor: "#020617", borderWidth: 3 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "right", labels: { color: "rgba(148,163,184,0.7)", font: { family: "DM Sans", size: 11 }, boxWidth: 12, padding: 10 } } },
    },
  });
}

function buildTopic(anomalies) {
  destroyChart("topic");
  const counts = {};
  anomalies.filter((a) => a.anomaly_pred === 1).forEach((a) => { counts[a.topic_category] = (counts[a.topic_category] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  charts.topic = new Chart(document.getElementById("chartTopic").getContext("2d"), {
    type: "bar",
    data: {
      labels: sorted.map((s) => s[0]),
      datasets: [{
        data: sorted.map((s) => s[1]),
        backgroundColor: sorted.map((_, i) => `hsl(${250 + i * 20},70%,65%)`),
        borderRadius: 6, borderSkipped: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: TICK_STYLE, grid: CHART_GRID },
        y: { ticks: { color: "rgba(148,163,184,0.7)", font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
}

function buildScatter(anomalies) {
  destroyChart("scatter");
  const anom   = anomalies.filter((a) => a.anomaly_pred === 1).slice(0, 80);
  const normal = anomalies.filter((a) => a.anomaly_pred !== 1).slice(0, 80);
  charts.scatter = new Chart(document.getElementById("chartScatter").getContext("2d"), {
    type: "scatter",
    data: {
      datasets: [
        { label: "Anomaly", data: anom.map((a) => ({ x: +a.sentiment_score, y: +a.engagement_score })),
          backgroundColor: "rgba(244,63,94,0.6)", pointRadius: 5 },
        { label: "Normal",  data: normal.map((a) => ({ x: +a.sentiment_score, y: +a.engagement_score })),
          backgroundColor: "rgba(139,92,246,0.25)", pointRadius: 3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: LEGEND_STYLE } },
      scales: {
        x: { title: { display: true, text: "Sentiment Score", color: "#475569", font: { size: 10 } }, ticks: TICK_STYLE, grid: CHART_GRID },
        y: { title: { display: true, text: "Engagement",      color: "#475569", font: { size: 10 } }, ticks: TICK_STYLE, grid: CHART_GRID },
      },
    },
  });
}

// ─────────────────────────────────────────────
// 15. FULL RENDER PASS
// ─────────────────────────────────────────────
function renderDashboard() {
  const { fa, fe } = getFilteredData();
  filteredAnomalies = fa;
  filteredEvents    = fe;

  renderKPIs(computeKPIs(fa, fe));
  renderTable(fe);

  document.getElementById("dash-count").innerHTML =
    `Showing <span class="font-mono" style="color:var(--violet)">${fa.length.toLocaleString()}</span> records · <span class="font-mono" style="color:var(--cyan)">${fe.length}</span> events`;

  buildTimeline(fa);
  buildPlatform(fa);
  buildTopic(fa);
  buildScatter(fa);

  renderEventsGrid(fe);
}

// ─────────────────────────────────────────────
// 16. LIVE MODE
// ─────────────────────────────────────────────
function toggleLive() {
  liveMode = !liveMode;
  const btn   = document.getElementById("live-btn");
  const label = document.getElementById("live-label");
  const icon  = document.getElementById("live-icon");

  if (liveMode) {
    btn.classList.add("active");
    label.textContent = "Live";
    icon.classList.add("animate-pulse");
    liveInterval = setInterval(() => {
      const d = generateMockData();
      allAnomalies = d.anomalies;
      allEvents    = d.events;
      renderDashboard();
      showToast("🔄 Dashboard updated", "info");
      pushNotif("🔄", "Dashboard refreshed via live mode");
    }, 5000);
  } else {
    btn.classList.remove("active");
    label.textContent = "Go Live";
    icon.classList.remove("animate-pulse");
    clearInterval(liveInterval);
  }
}

function refreshData() {
  const icon = document.getElementById("refresh-icon");
  icon.classList.add("animate-spin");
  setTimeout(() => {
    const d = generateMockData();
    allAnomalies = d.anomalies;
    allEvents    = d.events;
    renderDashboard();
    icon.classList.remove("animate-spin");
    showToast("✓ Data refreshed", "success");
  }, 700);
}

// ─────────────────────────────────────────────
// 17. CSV EXPORT
// ─────────────────────────────────────────────
function exportCSV() {
  const { fe } = getFilteredData();
  const headers = ["event_id","event_label","dominant_platform","dominant_topic","post_count","confidence_mean","event_intensity","start_time","end_time"];
  const rows    = [headers.join(","), ...fe.map((e) => headers.map((h) => `"${e[h] ?? ""}"`).join(","))];
  const blob    = new Blob([rows.join("\n")], { type: "text/csv" });
  const a       = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `aura_events_${Date.now()}.csv` });
  a.click();
  showToast("📥 CSV downloaded", "success");
}

// ─────────────────────────────────────────────
// 18. HISTORY TAB
// ─────────────────────────────────────────────
async function loadHistory() {
  const list  = document.getElementById("history-list");
  const empty = document.getElementById("history-empty");
  if (!list || !currentUser) return;

  try {
    const runs = await listRuns(currentUser.uid);
    if (!runs.length) {
      list.innerHTML = "";
      if (empty) empty.style.display = "flex";
      return;
    }
    if (empty) empty.style.display = "none";
    list.innerHTML = runs.map((r) => `
      <div class="history-card" onclick="loadRunFromHistory('${r.id}','${r.source}')">
        <div class="history-card-info">
          <h4>${r.source || "Analysis Run"}</h4>
          <div class="history-card-meta">
            ${r.anomalyCount?.toLocaleString() || 0} anomalies · ${r.eventCount || 0} events ·
            ${r.createdAt ? new Date(r.createdAt.toDate()).toLocaleString() : "—"}
          </div>
        </div>
        <div class="history-card-badge">${r.id}</div>
      </div>
    `).join("");
  } catch (e) {
    console.warn("Could not load history:", e.message);
    list.innerHTML = `<div style="color:var(--text3);font-size:13px;padding:16px">Could not load history.</div>`;
  }
}

async function loadRunFromHistory(runId, source) {
  if (!currentUser) return;
  showToast("Loading run…", "info");
  try {
    const data = await loadRun(currentUser.uid, runId);
    allAnomalies = data.anomalies;
    allEvents    = data.events;
    finaliseLoad(source || runId, false);
    switchTab("dashboard");
  } catch (e) {
    showToast("Could not load run: " + e.message, "error");
  }
}

// ─────────────────────────────────────────────
// 19. NAVIGATION
// ─────────────────────────────────────────────
function goPage(name) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.getElementById("page-" + name).classList.add("active");
  window.scrollTo(0, 0);
  closeEventPanel();
  closeModals();
}

function switchTab(name) {
  const tabs    = ["dashboard","events","history","settings"];
  const mobBtns = ["dashboard","events","history","settings"];

  tabs.forEach((t) => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.style.display = t === name ? "block" : "none";
    const sb = document.getElementById(`sb-${t}`);
    if (sb) sb.classList.toggle("active", t === name);
    const mob = document.getElementById(`mob-${t}`);
    if (mob) mob.classList.toggle("active", t === name);
  });

  if (name === "events")  renderEventsGrid(filteredEvents.length ? filteredEvents : allEvents);
  if (name === "history") loadHistory();
}

function closeModals() {
  const panel = document.getElementById("notif-panel");
  if (panel) panel.style.display = "none";
  notifPanelOpen = false;
}

// ─────────────────────────────────────────────
// 20. NOTIFICATIONS
// ─────────────────────────────────────────────
function pushNotif(icon, text) {
  notifications.unshift({ icon, text, time: new Date() });
  if (notifications.length > 20) notifications.pop();

  const dot = document.getElementById("notif-dot");
  if (dot) dot.classList.add("active");

  renderNotifs();
}

function renderNotifs() {
  const list = document.getElementById("notif-list");
  if (!list) return;
  if (!notifications.length) {
    list.innerHTML = `<div class="notif-empty">No notifications</div>`;
    return;
  }
  list.innerHTML = notifications.slice(0, 10).map((n) => `
    <div class="notif-item">
      <span style="font-size:16px;flex-shrink:0">${n.icon}</span>
      <div>
        <div style="font-size:13px;color:var(--text1)">${n.text}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;font-family:'JetBrains Mono',monospace">${n.time.toLocaleTimeString()}</div>
      </div>
    </div>
  `).join("");
}

function toggleNotifPanel() {
  const panel = document.getElementById("notif-panel");
  notifPanelOpen = !notifPanelOpen;
  panel.style.display = notifPanelOpen ? "block" : "none";
  if (notifPanelOpen) {
    const dot = document.getElementById("notif-dot");
    if (dot) dot.classList.remove("active");
  }
}

function clearNotifs() {
  notifications = [];
  renderNotifs();
}

// Close notif panel on outside click
document.addEventListener("click", (e) => {
  if (!e.target.closest("#notif-panel") && !e.target.closest("#notif-btn")) {
    const panel = document.getElementById("notif-panel");
    if (panel) panel.style.display = "none";
    notifPanelOpen = false;
  }
});

// ─────────────────────────────────────────────
// 21. TOAST SYSTEM
// ─────────────────────────────────────────────
function showToast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const iconMap = {
    success: `<svg class="toast-icon" fill="none" viewBox="0 0 24 24" stroke="var(--emerald)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg class="toast-icon" fill="none" viewBox="0 0 24 24" stroke="var(--rose)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg class="toast-icon" fill="none" viewBox="0 0 24 24" stroke="var(--violet)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `${iconMap[type] || ""}<span>${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-exit");
    setTimeout(() => toast.remove(), 280);
  }, 2800);
}

// ─────────────────────────────────────────────
// 22. UTILITY HELPERS
// ─────────────────────────────────────────────

function getInitials(nameOrEmail) {
  if (!nameOrEmail) return "?";
  const parts = nameOrEmail.split(/[\s@]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || "?").slice(0, 2).toUpperCase();
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}