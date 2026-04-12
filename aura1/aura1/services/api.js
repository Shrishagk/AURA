/* =============================================
   AURA v2 — API Service Layer
   services/api.js
   
   All Firebase + data operations live here.
   Import this file in app.js for clean separation.
   ============================================= */

// ─── Cache ───────────────────────────────────
const CACHE = new Map();
const CACHE_TTL = 60_000; // 1 min

function cacheGet(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { CACHE.delete(key); return null; }
  return entry.data;
}
function cacheSet(key, data) {
  CACHE.set(key, { data, ts: Date.now() });
}

// ─── Firestore helpers ────────────────────────
function getDB() {
  return firebase.firestore();
}

// ─── User Profile ─────────────────────────────

/**
 * Create or update a user document in Firestore.
 * Called after login / signup.
 */
async function upsertUserProfile(user) {
  const db  = getDB();
  const ref = db.collection("users").doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      uid:       user.uid,
      email:     user.email,
      name:      user.displayName || "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      prefs: {
        emailAlerts:   true,
        weeklyDigest:  false,
        pushNotifs:    true,
        autoRefresh:   true,
        showConfidence: true,
        darkTheme:      true,
      },
    });
  } else {
    await ref.update({
      email: user.email,
      name:  user.displayName || snap.data().name || "",
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  return (await ref.get()).data();
}

/**
 * Fetch user profile from Firestore.
 */
async function getUserProfile(uid) {
  const cached = cacheGet(`profile_${uid}`);
  if (cached) return cached;
  const snap = await getDB().collection("users").doc(uid).get();
  const data = snap.exists ? snap.data() : null;
  if (data) cacheSet(`profile_${uid}`, data);
  return data;
}

/**
 * Update display name + password via Firebase Auth,
 * then persist name change to Firestore.
 */
async function updateUserSettings(user, { name, password }) {
  const updates = [];
  if (name && name !== user.displayName) {
    updates.push(user.updateProfile({ displayName: name }));
    updates.push(
      getDB().collection("users").doc(user.uid).update({ name })
    );
  }
  if (password && password.length >= 6) {
    updates.push(user.updatePassword(password));
  }
  await Promise.all(updates);
  CACHE.delete(`profile_${user.uid}`);
}

/**
 * Save user notification / preference prefs.
 */
async function saveUserPrefs(uid, prefs) {
  await getDB().collection("users").doc(uid).update({ prefs });
  CACHE.delete(`profile_${uid}`);
}

// ─── Anomaly / Event Data ─────────────────────

/**
 * Save a full analysis run to Firestore under the user's subcollection.
 * Splits anomalies + events into separate batches (Firestore 500-doc limit).
 */
async function saveAnalysisRun(uid, { anomalies, events, source }) {
  const db    = getDB();
  const runId = `run_${Date.now()}`;
  const runRef = db.collection("users").doc(uid).collection("runs").doc(runId);

  // Write metadata doc
  await runRef.set({
    id:          runId,
    source,
    anomalyCount: anomalies.length,
    eventCount:   events.length,
    createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
  });

  // Batch-write events (max 500 at a time)
  const batchWrite = async (colName, items) => {
    for (let i = 0; i < items.length; i += 499) {
      const batch = db.batch();
      items.slice(i, i + 499).forEach((item, j) => {
        const ref = runRef.collection(colName).doc(`${i + j}`);
        batch.set(ref, item);
      });
      await batch.commit();
    }
  };

  await batchWrite("anomalies", anomalies.slice(0, 2000));
  await batchWrite("events",    events.slice(0, 500));

  return runId;
}

/**
 * List the 10 most recent analysis runs for a user.
 */
async function listRuns(uid) {
  const snap = await getDB()
    .collection("users").doc(uid)
    .collection("runs")
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();
  return snap.docs.map(d => d.data());
}

/**
 * Load anomalies + events from a specific run.
 */
async function loadRun(uid, runId) {
  const cacheKey = `run_${uid}_${runId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const runRef = getDB()
    .collection("users").doc(uid)
    .collection("runs").doc(runId);

  const [anomSnap, evtSnap] = await Promise.all([
    runRef.collection("anomalies").get(),
    runRef.collection("events").get(),
  ]);

  const data = {
    anomalies: anomSnap.docs.map(d => d.data()),
    events:    evtSnap.docs.map(d => d.data()),
  };
  cacheSet(cacheKey, data);
  return data;
}

/**
 * Save user action log (for analytics / history tab).
 */
async function logUserAction(uid, action, meta = {}) {
  try {
    await getDB().collection("users").doc(uid)
      .collection("activity").add({
        action,
        meta,
        ts: firebase.firestore.FieldValue.serverTimestamp(),
      });
  } catch (_) { /* non-critical */ }
}

// ─── Google Sign-In ───────────────────────────

async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return firebase.auth().signInWithPopup(provider);
}

// ─── Firebase error map ───────────────────────

function firebaseErrorMessage(code) {
  const map = {
    "auth/user-not-found":         "No account found with this email.",
    "auth/wrong-password":         "Incorrect password.",
    "auth/email-already-in-use":   "An account with this email already exists.",
    "auth/invalid-email":          "Please enter a valid email address.",
    "auth/weak-password":          "Password must be at least 6 characters.",
    "auth/too-many-requests":      "Too many attempts. Please wait and try again.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/invalid-credential":     "Invalid email or password.",
    "auth/user-disabled":          "This account has been disabled.",
    "auth/popup-closed-by-user":   "Sign-in popup was closed.",
    "auth/cancelled-popup-request":"Sign-in was cancelled.",
  };
  return map[code] || "An unexpected error occurred.";
}

// ─── Debounce utility ─────────────────────────

function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}