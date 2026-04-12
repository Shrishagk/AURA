# AURA Frontend

> **One folder. Zero build steps. Full-stack feel.**

This is the complete client-side application for AURA v2 — a self-contained, dependency-free frontend that talks directly to Firebase. No Webpack. No React. No node_modules. Open the file and it works.

---

## 📁 Project Structure

```
frontend/
│
├── index.html          ← The entire UI: all pages, all tabs, all components
├── style.css           ← Complete design system (900+ lines, zero frameworks)
├── app.js              ← Application logic: auth, state, rendering, charts, filters
│
└── services/
    └── api.js          ← Firebase abstraction layer: Firestore CRUD, Auth helpers
```

That's it. Four files. Here's what each one owns:

---

### `index.html` — The Shell

All five "pages" live inside one HTML file, toggled by a JavaScript page router:

| Page ID | What it is |
|---|---|
| `#page-landing` | Public marketing page with hero, features, CTA strip, footer |
| `#page-login` | Email/password login form + Google SSO |
| `#page-signup` | Registration form with password strength meter |
| `#page-forgot` | Password reset via Firebase email |
| `#page-app` | The full authenticated app shell |

The app shell (`#page-app`) contains a **sidebar + main content area** with four switchable tabs:

| Tab ID | What it renders |
|---|---|
| `#tab-dashboard` | KPI cards, filters, upload zone, 4 charts, events table |
| `#tab-events` | Full event grid (card layout, click-to-expand) |
| `#tab-history` | Past analysis runs from Firestore |
| `#tab-settings` | Profile, notification prefs, danger zone |

**Other mounted components:**
- `#main-nav` — Sticky navbar (switches between public/auth states)
- `#notif-panel` — Notification dropdown
- `#event-panel` — Sliding detail panel (opens on row/card click)
- `#toast-container` — Bottom-right toast notifications
- `.overlay` — Backdrop for panel and modal dismissal

---

### `style.css` — The Design System

All styles are written in plain CSS with custom properties. No preprocessor, no utility framework.

**CSS Variable Reference:**

```css
/* Palette */
--violet:   #8b5cf6    /* Primary accent */
--cyan:     #06b6d4    /* Secondary accent */
--emerald:  #10b981    /* Success states */
--rose:     #f43f5e    /* Error / danger */
--orange:   #f97316    /* Warning */
--yellow:   #eab308    /* Caution */

/* Backgrounds */
--bg:       #020617    /* Page background */
--bg2:      #080d1a    /* Elevated surface */
--bg3:      #0d1424    /* Cards */

/* Text */
--text1:    #f1f5f9    /* Primary text */
--text2:    #94a3b8    /* Secondary text */
--text3:    #475569    /* Muted / captions */

/* Borders */
--border:   rgba(139,92,246,0.10)
--border2:  rgba(139,92,246,0.20)
--border3:  rgba(139,92,246,0.32)

/* Spacing */
--radius:    16px
--radius-sm: 10px
--radius-xs: 7px
--nav-h:     64px
--sidebar-w: 220px
```

**Component classes you'll touch most:**

```
.btn-primary / .btn-ghost / .btn-outline / .btn-icon / .btn-danger
.form-input / .form-label / .input-group
.kpi-card / .kpi-grid / .kpi-skeleton
.chart-card / .chart-wrap / .charts-row
.filter-bar / .filter-search / .filter-select
.event-card / .event-panel
.badge / .badge-critical / .badge-high / .badge-medium / .badge-low
.toast / .toast--success / .toast--error / .toast--info
.animate-fade-in / .animate-spin / .animate-pulse
```

---

### `app.js` — The Application Brain

Organized into 22 numbered sections:

```
1.  Firebase Config           — initializeApp(), auth, db references
2.  State                     — currentUser, allAnomalies, allEvents, charts, ...
3.  Firebase Auth Listener    — onAuthStateChanged handler
4.  Auth Actions              — login, signup, forgot, google, logout, deleteAccount
5.  Auth Helpers              — showAuthError, setAuthLoading, togglePw, pw strength
6.  Mock Data Generator       — generateMockData() — 300 anomalies, 20 events
7.  File Upload & Parsing     — drag/drop, JSON parse, CSV parse, schema detection
8.  Data Loading              — loadData() — called on login, uses mock fallback
9.  Filter Logic              — getFilteredData(), applyFilters(), resetFilters()
10. KPI Computation           — computeKPIs() — derives 4 metric cards from data
11. Table Rendering           — renderTable() — top 50 events in the dashboard table
12. Events Grid               — renderEventsGrid() — card grid on the Events tab
13. Event Detail Panel        — openEventPanel() / closeEventPanel()
14. Charts                    — buildTimeline/Platform/Topic/Scatter() — Chart.js
15. Full Render Pass          — renderDashboard() — triggers all of the above
16. Live Mode                 — toggleLive() — 5s interval refresh
17. CSV Export                — exportCSV() — respects active filters
18. History Tab               — loadHistory(), loadRunFromHistory()
19. Navigation                — goPage(), switchTab(), closeModals()
20. Notifications             — pushNotif(), renderNotifs(), toggleNotifPanel()
21. Toast System              — showToast(msg, type) — info / success / error
22. Utility Helpers           — getInitials(), getTimeOfDay(), rand(), debounce()
```

---

### `services/api.js` — The Firebase Layer

All Firestore and Auth operations are isolated here so `app.js` stays clean.

| Function | Purpose |
|---|---|
| `upsertUserProfile(user)` | Create or update `/users/{uid}` doc on login |
| `getUserProfile(uid)` | Fetch profile with 60s in-memory cache |
| `updateUserSettings(user, {name, password})` | Update displayName + Firestore + optional password |
| `saveUserPrefs(uid, prefs)` | Persist notification/display prefs to Firestore |
| `saveAnalysisRun(uid, {anomalies, events, source})` | Batch-write run to Firestore (500-doc limit handled) |
| `listRuns(uid)` | Fetch 10 most recent runs, ordered by `createdAt desc` |
| `loadRun(uid, runId)` | Load anomalies + events from a specific run (cached) |
| `logUserAction(uid, action, meta)` | Fire-and-forget action log entry |
| `signInWithGoogle()` | Firebase Google OAuth popup |
| `firebaseErrorMessage(code)` | Maps Firebase error codes to human-readable strings |
| `debounce(fn, ms)` | Utility — used for search input throttling |

**Cache behavior:** `getUserProfile` and `loadRun` both use a simple `Map`-based cache with a 60-second TTL. Cache is invalidated on settings save.

---

## ⚙️ Firebase Setup

Before the app can run with real auth and data persistence, you need a Firebase project.

### Step 1 — Create a Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it (e.g. `aura-v2`) → Continue

### Step 2 — Enable Authentication

1. In your project → **Build → Authentication → Get started**
2. **Sign-in method** tab → Enable **Email/Password**
3. Enable **Google** → add your project's support email → Save

### Step 3 — Create Firestore Database

1. **Build → Firestore Database → Create database**
2. Choose **Start in test mode** (for development) → Next → Enable

### Step 4 — Get Your Config

1. **Project settings (gear icon) → General → Your apps**
2. Click the `</>` (Web) icon → Register app → Copy the config object

### Step 5 — Paste Config into app.js

Open `frontend/app.js` and replace the placeholder `firebaseConfig`:

```javascript
// Line ~17 in app.js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
```

---

## 🏃 Running the App

### Option A — Direct File Open *(simplest)*

```bash
# Just open the file — works for most features
open frontend/index.html
```

> ⚠️ Google Sign-In requires a proper HTTP origin. Use Option B if you need Google auth.

### Option B — Local Dev Server *(recommended)*

```bash
# Using Node.js serve
npx serve frontend/

# Using Python
cd frontend && python -m http.server 8080

# Using VS Code
# Install "Live Server" extension → Right-click index.html → Open with Live Server
```

App will be running at `http://localhost:3000` (or `8080` for Python).

### Option C — Firebase Hosting *(production)*

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login and init
firebase login
firebase init hosting
# → Public directory: frontend
# → Single-page app: No
# → Overwrite index.html: No

# Deploy
firebase deploy
```

---

## 🧪 Testing with Sample Data

No real data? No problem. AURA ships with a built-in mock data generator.

On login, it auto-loads **300 anomaly records** and **20 events** across 7 platforms and 8 topic categories, spanning the last 30 days. This is `generateMockData()` in `app.js`.

To test file upload, create a `test.json`:

```json
{
  "anomalies": [
    {
      "timestamp": "2025-06-01T10:30:00Z",
      "platform": "Twitter",
      "topic_category": "Technology",
      "engagement_score": 91.4,
      "sentiment_score": 0.72,
      "anomaly_pred": 1,
      "detected_type": "spike",
      "anomaly_reason": "Viral cascade initiated",
      "confidence_score": 0.94,
      "anomaly_strength": 4.2,
      "hashtags": "#AI #viral",
      "event_id": "EVT001"
    }
  ],
  "events": [
    {
      "event_id": "EVT001",
      "event_label": "AI Announcement Surge",
      "dominant_platform": "Twitter",
      "dominant_topic": "Technology",
      "post_count": 14200,
      "confidence_mean": 0.94,
      "event_intensity": "critical",
      "start_time": "2025-06-01T08:00:00Z",
      "end_time": "2025-06-01T18:00:00Z",
      "top_hashtags": "#AI #viral",
      "detected_type": "spike",
      "ai_explanation": "Unusual engagement velocity detected following a major product announcement."
    }
  ]
}
```

Drag this file onto the upload zone in the Dashboard tab.

---

## 🔒 Firestore Security Rules

For development, test mode rules are fine. For production, use these:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /runs/{runId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;

        match /anomalies/{docId} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }
        match /events/{docId} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }
      }

      match /activity/{docId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

---

## 🐛 Common Issues

| Symptom | Cause | Fix |
|---|---|---|
| Google sign-in popup blocked | Running from `file://` | Use a local HTTP server (Option B) |
| `Firebase: No Firebase App` error | Config not pasted | Replace `firebaseConfig` in `app.js` |
| Charts not rendering | Canvas not in DOM yet | Check browser console — likely a typo in canvas ID |
| History tab empty | Firestore not set up | Check Firebase Console → Firestore is created |
| Data won't save to Firestore | Security rules blocking | Check Firestore rules allow writes for authenticated user |
| `auth/operation-not-allowed` | Google auth not enabled | Enable Google in Firebase Console → Auth → Sign-in methods |

---

## 🔧 Customization Quick Reference

**Add a new platform:**
```javascript
// app.js → generateMockData() → platforms array
const platforms = ["Twitter", "Instagram", "Reddit", "TikTok", "YouTube", "Facebook", "LinkedIn", "Bluesky"];
```

**Change live mode refresh interval:**
```javascript
// app.js → toggleLive() → setInterval
liveInterval = setInterval(() => { ... }, 5000); // Change 5000ms
```

**Add a new chart:**
1. Add a `<canvas id="chartMyNew">` inside a `.chart-card` in `index.html`
2. Write a `buildMyNew(anomalies)` function in `app.js` (follow the pattern of `buildTimeline`)
3. Call it inside `renderDashboard()`

**Change the color palette:**
```css
/* style.css → :root */
--violet: #your-color;
--cyan:   #your-color;
```

---

<div align="center">

The frontend is intentionally simple to reason about.  
One file per concern. No magic. No framework overhead.  

**Read `app.js` top to bottom once and you'll understand everything.**

</div>
