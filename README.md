<div align="center">

```
 ▄▄▄· ▄• ▄▌▄▄▄   ▄▄▄·
▐█ ▀█ █▪██▌▀▄ █·▐█ ▀█
▄█▀▀█ █▌▐█▌▐▀▀▄ ▄█▀▀█
▐█ ▪▐▌▐█▄█▌▐█•█▌▐█ ▪▐▌
 ▀  ▀  ▀▀▀ .▀  ▀ ▀  ▀
```

**Anomaly Intelligence Platform — v2.0**

*The internet generates signals. AURA reads them.*

[![Platform](https://img.shields.io/badge/platform-web-8b5cf6?style=flat-square&logo=googlechrome&logoColor=white)](https://github.com)
[![Firebase](https://img.shields.io/badge/backend-Firebase-F5820D?style=flat-square&logo=firebase&logoColor=white)](https://firebase.google.com)
[![Chart.js](https://img.shields.io/badge/charts-Chart.js-FF6384?style=flat-square&logo=chartdotjs&logoColor=white)](https://chartjs.org)
[![Auth](https://img.shields.io/badge/auth-Google%20%2B%20Email-4285F4?style=flat-square&logo=google&logoColor=white)](https://firebase.google.com/docs/auth)
[![License](https://img.shields.io/badge/license-MIT-10b981?style=flat-square)](LICENSE)

</div>

---

## ⚡ What Problem Does AURA Solve?

Every day, billions of posts move across social platforms. Most are noise.  
A few are **signals** — coordinated spikes, sudden drops, viral cascades — that tell you something real is happening.

Traditional analytics tools tell you *what* happened.  
**AURA tells you *why* it happened — and flags it before you even notice.**

> AURA is not a dashboard. It's a **behavioral surveillance layer** built on top of social data.

---

## 🎬 Feature Walkthrough

### 🔐 Authentication — Built for Real Users

AURA ships with a complete, production-grade auth system — not a placeholder login screen.

| Method | Details |
|--------|---------|
| 📧 Email / Password | Full registration, login, forgot-password flow |
| 🟦 Google SSO | One-click sign-in via Firebase OAuth popup |
| 🔒 Secure isolation | Each user's data lives in their own Firestore subcollection |
| 🛡️ Settings | Update display name, change password, delete account — all from within the app |

**The authentication layer is complete end-to-end** — password strength meter, loading spinners, error code mapping, enter-key shortcuts, and eye-toggle for password fields included.

---

### 📊 Interactive Dashboard

The command center. Everything you need, nothing you don't.

**4 Live KPI Cards** — each with an accent gradient, delta indicator, and shimmer skeleton loader while data populates:

| Card | What it tracks |
|------|----------------|
| 🟣 Anomalies Detected | Count of flagged records vs. total dataset |
| 🔴 Events Flagged | Total event clusters + critical count |
| 🟢 Avg Confidence | Weighted mean confidence score across events |
| 🟡 Total Engagement | Cumulative engagement across all platforms |

**Advanced Filter Bar** — filter by platform, topic, type (spike/drop), severity (low → critical), and keyword search (debounced at 280ms to avoid excessive re-renders).

**4 Synchronized Charts** — all update instantly on every filter change:

```
📈 Timeline     → Engagement + anomaly frequency over 30 days (dual-axis line)
🍩 Platform     → Breakdown of anomaly count per platform (doughnut)
📊 Topic        → Horizontal bar showing anomaly-heavy topics
🔵 Scatter      → Sentiment vs. Engagement — reveals hidden clusters
```

---

### ⚠️ Anomaly Detection Engine

Each anomaly record carries:

```json
{
  "timestamp":        "ISO-8601 datetime",
  "platform":         "Twitter | Instagram | Reddit | TikTok | ...",
  "topic_category":   "Politics | Sports | Technology | ...",
  "engagement_score": 84.7,
  "sentiment_score":  -0.312,
  "anomaly_pred":     1,
  "detected_type":    "spike | drop",
  "anomaly_reason":   "Z-score threshold exceeded by 3.2σ",
  "confidence_score": 0.934,
  "anomaly_strength": 4.1,
  "hashtags":         "#trending #viral #tech",
  "event_id":         "EVT007"
}
```

Detection types include:
- **Viral Spikes** — engagement surges beyond statistical thresholds
- **Engagement Drops** — sudden unexplained activity collapses
- **Coordinated Activity** — bot-like behaviour cluster patterns
- **Sentiment Reversals** — sudden shift in community tone

---

### 📦 Event Intelligence System

Raw anomalies alone are noisy. AURA **clusters them into Events** — meaningful named groupings that map to real-world moments.

Every event contains:

```
Event ID      → Unique identifier (EVT001 – EVT999)
Event Label   → Human-readable name ("Tech Conference Surge")
Platform      → Dominant platform for this event
Topic         → Dominant topic category
Post Count    → Volume of posts in the cluster
Confidence    → Mean confidence score across member anomalies
Intensity     → low | medium | high | critical
Time Window   → start_time → end_time
Top Hashtags  → Most prevalent hashtags in the cluster
AI Explanation→ Auto-generated reasoning for why this event was flagged
```

Events are displayed both in a **scannable table** (top 50, sortable) and in a **grid of expandable cards** in the dedicated Events tab.

---

### 🧠 AI Explanation Panel

Click any event — anywhere in the app — to open a **side-panel detail view** with:

- Full event metadata and confidence bar
- AI-generated contextual reasoning
- Engagement peak + post volume stats
- Duration (auto-computed from start/end timestamps)
- Hashtag cloud
- Severity and type badges

The panel slides in from the right with a smooth 320ms cubic-bezier animation and a backdrop overlay.

---

### 📂 Data Upload System

AURA speaks two data formats natively:

**JSON** — accepts either:
```json
{ "anomalies": [...], "events": [...] }   // Pre-split structure
[{ "engagement_score": ..., ... }]         // Raw array (auto-detected)
```

**CSV** — any CSV with recognizable column names. AURA auto-normalizes column variants:

| Canonical Field | Also recognized as |
|---|---|
| `timestamp` | `date`, `created_at`, `ts` |
| `platform` | `source`, `network` |
| `engagement_score` | `engagement`, `score`, `value` |

If events aren't present in the data, **AURA derives them automatically** from anomaly clusters grouped by `event_id`.

Drag & Drop is supported — or click to browse. On successful upload, data is **saved to Firestore** and appears in your history.

---

### ⚡ Live Mode

Toggle **Go Live** to activate real-time simulation:
- Dashboard auto-refreshes every **5 seconds**
- New mock data is generated on each tick
- A toast notification and notification log entry fire on each refresh
- The Live button pulses with a visual indicator while active

Designed to simulate the experience of monitoring a live feed — ideal for demos or testing.

---

### 🗂️ History Tracking

Every non-mock upload is persisted to Firestore under your user account.

- Lists your **10 most recent analysis runs**, sorted newest-first
- Each entry shows: filename, anomaly count, event count, timestamp
- Click any history entry to **restore that exact dataset** back into the dashboard — including all charts and filters

Data is stored in a proper subcollection structure:
```
users/{uid}/runs/{runId}/anomalies/{0..N}
users/{uid}/runs/{runId}/events/{0..N}
```

---

### 🔔 Notification System

A lightweight in-app event log:
- Fires on: login, logout, file upload, history save, live refresh
- Notification bell with a **pulsing dot** indicator when unread items exist
- Dropdown panel with timestamps (JetBrains Mono formatted)
- One-click **Clear All**
- Capped at 20 entries — FIFO eviction

---

### 📥 CSV Export

Export your currently **filtered** event dataset as a `.csv` file:
```
event_id, event_label, dominant_platform, dominant_topic,
post_count, confidence_mean, event_intensity, start_time, end_time
```

Respects all active filters — what you see is what you export.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT BROWSER                    │
│                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  Landing  │  │  Auth Pages  │  │  App Shell    │ │
│  │  Page    │  │ Login/Signup │  │  Dashboard    │ │
│  └──────────┘  └──────────────┘  │  Events Tab   │ │
│                                  │  History Tab  │ │
│                                  │  Settings Tab │ │
│                                  └───────────────┘ │
│                       │                            │
│            ┌──────────┴──────────┐                 │
│            │    services/api.js  │                 │
│            │  (Firebase layer)   │                 │
│            └──────────┬──────────┘                 │
└───────────────────────┼────────────────────────────┘
                        │
          ┌─────────────▼──────────────┐
          │        FIREBASE            │
          │                            │
          │  Authentication            │
          │  ├─ Email/Password         │
          │  └─ Google OAuth           │
          │                            │
          │  Firestore Database        │
          │  └─ users/{uid}            │
          │     ├─ profile doc         │
          │     ├─ prefs               │
          │     └─ runs/{runId}        │
          │        ├─ anomalies/*      │
          │        └─ events/*         │
          └────────────────────────────┘
```

---

## 🎨 Design System

AURA was designed from scratch with a **cyber-intelligence aesthetic** — dark, precise, data-dense.

| Token | Value |
|---|---|
| Primary | `#8b5cf6` (Violet) |
| Secondary | `#06b6d4` (Cyan) |
| Success | `#10b981` (Emerald) |
| Danger | `#f43f5e` (Rose) |
| Background | `#020617` (Near-black) |
| Display Font | `Syne` (800 weight) |
| Body Font | `DM Sans` |
| Mono Font | `JetBrains Mono` |

Animated elements: ambient background blobs, grid overlay, skeleton loaders, shimmer states, live ticker, badge pulse, scroll-based animations.

---

## 📋 Data Schema Reference

<details>
<summary><strong>Anomaly Record Schema</strong></summary>

```typescript
interface Anomaly {
  timestamp:        string;   // ISO-8601
  platform:         string;   // "Twitter" | "Instagram" | ...
  topic_category:   string;   // "Politics" | "Sports" | ...
  engagement_score: number;   // 0–100
  sentiment_score:  number;   // -1 to +1
  anomaly_pred:     0 | 1;    // 1 = anomaly
  detected_type:    "spike" | "drop";
  anomaly_reason:   string;
  confidence_score: number;   // 0.5–1.0
  anomaly_strength: number;   // 0–5
  hashtags:         string;
  event_id:         string;   // "EVT001"
}
```

</details>

<details>
<summary><strong>Event Record Schema</strong></summary>

```typescript
interface Event {
  event_id:          string;
  event_label:       string;
  dominant_platform: string;
  dominant_topic:    string;
  post_count:        number;
  engagement_max:    number;
  confidence_mean:   number;  // 0.5–1.0
  event_intensity:   "low" | "medium" | "high" | "critical";
  start_time:        string;  // ISO-8601
  end_time:          string;  // ISO-8601
  top_hashtags:      string;
  detected_type:     "spike" | "drop";
  ai_explanation:    string;
}
```

</details>

---

## 🚀 Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/your-username/aura-v2.git
cd aura-v2

# 2. Open frontend/
# → See frontend/README.md for full setup instructions

# 3. Configure Firebase
# → Add your Firebase config to frontend/app.js (firebaseConfig object)
# → Enable Email/Password + Google Auth in Firebase Console
# → Create a Firestore database

# 4. Open in browser (no build step required)
open frontend/index.html
# or: npx serve frontend/
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| UI | Vanilla HTML5 + CSS3 + JavaScript (ES2022) |
| Charts | Chart.js 4.4 |
| Auth | Firebase Authentication (Email + Google OAuth) |
| Database | Cloud Firestore |
| Fonts | Google Fonts (Syne, DM Sans, JetBrains Mono) |
| Build | None — zero-dependency frontend |

---

## 🗺️ Roadmap

- [ ] Real ML backend (Python FastAPI + scikit-learn anomaly detection)
- [ ] WebSocket support for true real-time streaming
- [ ] Custom alert thresholds per user
- [ ] Team workspaces (shared analysis runs)
- [ ] Twitter/Reddit API integrations for live data ingestion
- [ ] Export to PDF report

---

## 📜 License

MIT — do whatever you want with it. Attribution appreciated but not required.

---

<div align="center">

Built with obsession over details. Every pixel intentional.

**AURA** — *See what the internet doesn't want you to miss.*

</div>
