<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

<div align="center">

# 🛰️ CivicLens Global

**Every report moves your state's rank. Worldwide.**

A citizen-powered global governance index. Photograph a civic defect, let a
multi-agent Gemini pipeline analyse it, and watch your report ripple up a live
worldwide leaderboard of state-level civic health.

`React 19` · `TypeScript` · `Vite 6` · `Express` · `Firebase` · `Gemini 2.5 Flash` · `Google Maps`

</div>

## Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/cf05dc80-9e39-4db3-bfa8-d91427e36707


## 1. Project Overview

CivicLens Global is a single-page web application that turns citizen-submitted
photos of infrastructure problems (potholes, cracked roads, broken sewers,
garbage, water and electricity faults) into structured, geo-tagged, AI-scored
civic incident reports — and then gamifies the act of reporting by tying each
report to a global, state-level "Civic Health Index" leaderboard.

It is built as a **Google AI Studio "Build" application**. The `metadata.json`
declares the app name, a `geolocation` frame permission, and the
`MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` capability, and the repository's
original `README.md` is the AI Studio boilerplate pointing at an AI Studio app
URL. The combination of a Vite/React front end, a small Express server, and a
server-side Gemini integration is characteristic of that platform.

The product framing throughout the UI is competitive and motivational:
"CIVIC REVOLUTION", a "Global Civic Health Index", an "India Spotlight", and
copy that rewards each action with Civic XP and a visible rank movement.

## 2. Problem Statement Addressed

Civic infrastructure complaints are typically slow, unstructured, and invisible.
A citizen has no easy way to (a) describe a defect precisely, (b) prove where it
is, (c) see whether anyone is acting on it, or (d) feel that their individual
report matters at a scale larger than a single pothole.

The application targets four concrete gaps that are observable from the code:

1. **Unstructured reporting** — a free-text complaint is hard to triage.
   CivicLens forces structure: a category enum, an AI severity score, bounding
   boxes, and precise coordinates.
2. **No accountability loop** — reports vanish into a queue. Here, every issue
   has a status (`Reported → In Progress → Resolved`), citizen verification, and
   an official resolution step with proof.
3. **No sense of collective impact** — a single report feels pointless.
   CivicLens attaches each report to a state on a global leaderboard, so the
   stated promise ("every report moves your state's rank") is the core hook.
4. **Friction and trust** — reports must be tied to a real account and a real
   location. Authentication is mandatory, and verification is gated by a 5 km
   geofence.

## 3. Solution Summary

A user signs in, opens the **Report** flow, and provides an image via upload,
device camera, or a built-in demo image. The client compresses the image and
asks whether to attach GPS, then POSTs it to a server endpoint (`/api/scan`).

On the server, a **three-agent Gemini 2.5 Flash pipeline** runs sequentially:
a vision-grounding agent returns a title, category, and bounding boxes; a risk
agent turns that into a hazard description; and a geospatial agent produces
plausible coordinates. A deterministic formula then computes a severity score.
The result is streamed back into an animated "terminal" scan visualiser.

The user reviews and edits the auto-filled report (title, category, description,
location, coordinates), confirms GPS, and submits. The report is written to
Firestore, the submitter earns XP, and the associated state's score is nudged
upward — all reflected live via Firestore real-time subscriptions.

Other citizens can browse, search, and **verify** nearby reports (boosting XP
and advancing status). Users with the **official** role get a separate portal to
triage a severity-sorted queue and mark issues **Resolved** with a proof photo,
which recomputes that state's resolution-speed and score.

## 4. Key Features

### AI scanning & multi-agent analysis
- **Three sources of imagery**: drag-and-drop / file upload, live device camera
  (`getUserMedia` with rear-facing `environment` constraint), and a one-click
  demo pothole image.
- **Client-side image compression** before upload — a `<canvas>` resize down to
  a max of 500×375 px, JPEG re-encode at 0.7 quality, to keep base64 payloads
  small for transport and Firestore storage.
- **Server-side multi-agent Gemini pipeline** (`/api/scan`):
  - *Agent 1 — Vision Grounding*: locates defects and returns normalized
    bounding boxes (`x,y,w,h` as 0–100 %), a per-box label/confidence/colour, a
    title, and a category.
  - *Agent 2 — Risk Analyser*: consumes Agent 1's output and returns a technical
    hazard description.
  - *Agent 3 — Geospatial Dispatcher*: generates a plausible street name and
    lat/lng constrained to a Bengaluru bounding box.
  - *Deterministic severity*: `min(10, boxes.length × 1.5 + maxConfidence / 20)`
    — a real, reproducible calculation rather than an LLM guess.
  - All three agents use Gemini structured output (`responseSchema`) for safe
    JSON parsing.
- **Animated scan visualiser**: a fake-but-convincing progress bar, streaming
  terminal logs ("Gemini Multimodal", inference time, per-class detections), and
  bounding boxes that reveal sequentially over the source image.
- **Local fallback simulator**: if `/api/scan` fails, the client substitutes a
  hard-coded pothole result so the demo never dead-ends.

### Reporting workflow (3-step wizard)
- **Step 1 — Scanner**, **Step 2 — Review/Edit metadata**, **Step 3 — Success**.
- A **location prompt** asks the user to attach high-accuracy GPS or skip it.
- **Reverse geocoding** via OpenStreetMap Nominatim turns coordinates into a
  human-readable address, with a graceful coordinate-string fallback.
- A **6×5 spatial grid** maps coordinates to lettered/numbered cells (A1–F5)
  with hard-coded Bengaluru "Ward 12" street addresses, and snaps a report to
  its nearest cell.

### Global Civic Health Index (leaderboard)
- A worldwide ranking of 14 seeded states/regions (`INITIAL_STATES`) such as
  Bavaria, Singapore, Tokyo Metro, California, Maharashtra, Karnataka, Lagos.
- Each state carries a score, resolution speed, participation %, recent change,
  and a 6-point trend sparkline.
- A dedicated **India Spotlight** and a permanently **highlighted Karnataka**
  card. States are ranked live by score from Firestore.

### Citizen issue portal ("Active Reports")
- Real-time list of reports, **multi-term search** across title, location,
  description, category and ID, and an **all / mine** filter.
- A detail **Incident Inspector** with three sub-views: AI Scan View (image +
  bounding boxes), Google Maps, and Resolution Proof.
- **Verification** with guardrails: you cannot verify your own report, cannot
  verify twice, and must be within a **5 km radius** (Haversine distance).
  Verifying grants +25 XP and bumps the verifier count; at ≥5 verifications the
  status auto-advances to `In Progress`.
- **Delete** your own report.

### Gamification
- **Civic XP** (+50 per report, +25 per verification) and a `verifiedCount`
  stored per user.
- A live **citizen leaderboard** ("Top Karnataka Citizen Reporters") sorted by
  XP from the Firestore `users` collection.
- A "Earned Badges & Goals" panel.

### Official (municipal) portal
- Gated to users whose profile `role` is `official`.
- A **severity-descending ticket queue** with state/city/area filters, free-text
  search, and date/severity sorting.
- **Resolution flow**: provide a proof photo URL → status becomes `Resolved`,
  records a resolver and timestamp, and recomputes the state's `speed`
  (exponential moving average) and `score` based on how fast it was resolved.

### Resilience & UX
- **Offline mode**: detects `navigator.onLine`, queues reports to
  `localStorage('pendingReports')`, and **syncs to Firestore on reconnect**.
- **Toasts**, **Framer-Motion** (`motion/react`) transitions, a custom dark
  "command-center" aesthetic, and an interactive Google Map.

### Authentication
- **Email/password** sign-up and login, plus **Google popup** sign-in.
- A **role selector** (`citizen` / `official`) applied at login.
- Auto-creation/sync of a Firestore user profile document.
- The **entire app is auth-gated** — unauthenticated visitors see a full-screen
  landing/auth portal and cannot reach the dashboard.

## 5. End-to-End User Flow

```
Open app
  └─ Google Maps key missing? → "API Key Required" screen (hard stop)
  └─ Auth still loading?       → "Synchronizing Security Layer…" spinner
  └─ Not signed in?            → Landing + Auth portal (email/pwd or Google)

Signed in
  └─ App requests geolocation once; rebases the grid to the user's city
  └─ Tabs: Dashboard · Report Issue · Active Reports · Leaderboard
           (+ Official Portal if role = official)

Report Issue (3-step wizard)
  1. Scanner  → upload / camera / demo image
              → "attach GPS?" prompt
              → POST /api/scan → 3 Gemini agents + severity → animated reveal
  2. Review   → edit title / category / description / location / lat-lng
              → "Verify GPS & Submit"
  3. Success  → "Civic Report Verified"; +50 XP; Karnataka rank moves up
              → report written to Firestore; state score incremented

Active Reports
  └─ search / filter → open Inspector → Verify (≤5 km, +25 XP) or Delete (owner)

Official Portal (officials only)
  └─ severity-sorted queue → Resolve with proof URL → state speed/score recomputed
```

## 6. Technology Stack & Justification

| Layer | Choice | Why (as evidenced by the code) |
|---|---|---|
| UI framework | **React 19** (`StrictMode`) | Component model + hooks; the whole app is one large hook-driven function. |
| Language | **TypeScript ~5.8** | Typed state shapes (e.g. the `scannedOutput` and `Issue` structures). |
| Build/dev | **Vite 6** | Fast dev server, used in *middleware mode* inside the Express server. |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`) | Utility-first classes drive the entire dark "command-center" look inline. |
| Animation | **motion** (`motion/react`) | `AnimatePresence` + `motion.div` for tab/modal transitions and reveals. |
| Icons | **lucide-react** | Consistent line-icon set across the navigation and panels. |
| Maps | **@vis.gl/react-google-maps** | `APIProvider`, `Map`, `AdvancedMarker`, `Pin`, `useMap` for the incident map. |
| Server | **Express 4** | Serves the SPA *and* hosts the `/api/*` endpoints in one process. |
| Dev runtime | **tsx** | `npm run dev` runs `server.ts` directly without a pre-compile step. |
| Prod bundling | **esbuild** | Bundles `server.ts` → `dist/server.cjs` for `node` execution. |
| AI | **@google/genai** (Gemini 2.5 Flash) | Server-side vision + reasoning with structured-output schemas. |
| Auth & DB (client) | **firebase ^12** | Firestore real-time `onSnapshot` + Auth (email/password + Google). |
| DB (server) | **firebase-admin ^14** | Privileged Firestore writes via Application Default Credentials. |
| Config | **dotenv** | Loads `GEMINI_API_KEY` (and other env) on the server. |

## 7. Folder Structure

The repository is intentionally flat. Almost all logic lives in one file.

```
.
├── index.html              # HTML shell; loads Inter + Roboto Mono; mounts #root
├── package.json            # Scripts and dependencies (type: module)
├── tsconfig.json           # TS config (ES2022, react-jsx, bundler resolution, noEmit)
├── vite.config.ts          # React + Tailwind plugins; injects GOOGLE_MAPS_PLATFORM_KEY; HMR toggle
├── server.ts               # Express server: /api/scan (Gemini), /api/state/*, Vite/static serving
├── firebase-blueprint.json # Declarative entity/schema reference for User and Issue, + Firestore paths
├── firestore.rules         # Security rules for users / issues / states collections
├── metadata.json           # AI Studio app metadata (name, geolocation permission, Gemini capability)
├── README.md               # (original) AI Studio boilerplate
└── src/
    ├── main.tsx            # React entry; createRoot + <StrictMode><App/></StrictMode>
    ├── App.tsx             # ≈4,550 lines — the entire application
    ├── firebase.ts         # Firebase web init: Firestore (named DB), Auth, GoogleAuthProvider
    └── index.css           # Tailwind import + a no-scrollbar utility
```

## 8. Architecture Overview

The application has two halves that ship as one process.

**Front end (`src/App.tsx`).** A default-exported `App` component does two
things: it gates on the Google Maps key (rendering an instructions screen if
absent), then wraps everything in the Maps `APIProvider` and renders `MainApp`.
`MainApp` is a single, very large function component holding roughly five dozen
`useState` values and the entire UI as inline JSX. There is **no component
extraction** — tabs, modals, the report wizard, the official portal, and all
helpers are defined in this one function. Cross-cutting helpers
(`calculateDistance`, `reverseGeocode`, grid math, `formatTimestamp`,
`handleFirestoreError`) live at module scope above `MainApp`.

**Back end (`server.ts`).** A small Express app that:
- mounts a large JSON body limit (25 MB) to accept base64 images;
- initialises the server-side Gemini client (`@google/genai`) with a required
  `aistudio-build` User-Agent header;
- initialises `firebase-admin` against a **named** Firestore database using
  Application Default Credentials;
- exposes `/api/scan` (the multi-agent pipeline) plus `/api/state/impact` and
  `/api/state/resolve`;
- in development, runs Vite in **middleware mode** so the same server serves the
  SPA with HMR; in production, serves the compiled `dist/` and falls back to
  `index.html` for SPA routing.

**Data plane.** State flows almost entirely through Firestore real-time
subscriptions. `MainApp` opens three `onSnapshot` listeners — on `issues`,
`states`, and `users` — and mirrors them into local state (`issues`,
`dbStates`, `dbUsers`). Writes happen mostly **directly from the client** (the
Firebase web SDK), with the security rules as the only guard. Derived values
(filtered/sorted issues, comparison winners, Karnataka rank, India averages) are
computed with `useMemo` or plain derivations on each render.

```
┌──────────────────────────── Browser (React 19 SPA) ────────────────────────────┐
│  App  →  APIProvider (Google Maps)  →  MainApp                                  │
│                                                                                 │
│  ~60 useState   ·   useMemo derivations   ·   inline JSX (tabs + modals)        │
│                                                                                 │
│  Firestore SDK ── onSnapshot(issues/states/users) ──► local state               │
│  Firestore SDK ── setDoc/updateDoc/deleteDoc ───────► writes                    │
│  Auth SDK ────── email-pwd / Google popup                                       │
│  fetch("/api/scan")  ·  fetch(OSM Nominatim)  ·  navigator.geolocation/camera   │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                     │ (same origin, port 3000)
┌───────────────────────────────────▼─────────────────────────────────────────────┐
│  Express (server.ts)                                                            │
│   POST /api/scan ─► Gemini 2.5 Flash: Agent1 vision → Agent2 risk → Agent3 geo  │
│                     + deterministic severity → JSON payload                     │
│   POST /api/state/impact   (firebase-admin increment)   ← defined, see §14      │
│   POST /api/state/resolve  (firebase-admin transaction) ← defined, see §14      │
│   dev: Vite middleware  ·  prod: static dist/ + SPA fallback                    │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                     │ firebase-admin (ADC)
                              ┌──────▼──────┐
                              │  Firestore  │  users · issues · states
                              └─────────────┘
```

## 9. Firebase Usage

**Initialisation (`src/firebase.ts`).** The Firebase **web** config is
hard-coded in source (project `ordinal-gravity-wwjkk`). Firestore is opened
against a **named database** (`ai-studio-civiclensglobal-…`), not the default
`(default)` DB. Auth and a `GoogleAuthProvider` are exported alongside `db`.

**Collections (inferred from reads/writes and `firebase-blueprint.json`):**
- **`users/{uid}`** — `uid`, `email`, `displayName`, `xp`, `verifiedCount`,
  `role` (`citizen`/`official`), `createdAt`. Created on first sign-in; XP and
  counts are incremented on report/verify; sorted by XP for the leaderboard.
- **`issues/{id}`** — the rich incident document: `title`, `category`,
  `severity`, `status`, `location`, `lat`/`lng`, `photo`/`resolvedPhoto`,
  `upvotes`, `verified`, `verifiers[]`, `reporter{}`, `official{}`, `resolver{}`,
  `nearby[]`, `boxes[]`, `globalImpact{}`, `timestamp`, `userId`/`userEmail`.
- **`states/{stateName}`** — `rank`, `state`, `country`, `flag`, `score`,
  `speed`, `participation`, `change`, `trend[]`, optional `highlight`.

**Seeding behaviour.** On first subscription, if `states` is empty it is seeded
from `INITIAL_STATES`. The `issues` collection is *also* coded to seed from
`INITIAL_ISSUES` when empty — but `INITIAL_ISSUES` is an empty array, so in
practice nothing is seeded and the app starts with zero issues (see §14).

**Real-time mirroring.** Three `onSnapshot` listeners keep the UI live. The
issues listener additionally filters out legacy demo IDs (`CV-2847`, etc.),
rewrites known demo photo URLs to the canonical Unsplash demo image,
de-duplicates by `id`, and sorts by severity.

**Server-side admin (`server.ts`).** `firebase-admin` is initialised with
`applicationDefault()` credentials and writes to the same named DB using
`FieldValue.increment` and a `runTransaction` for the resolve calculation.

**Security rules (`firestore.rules`).** Public read on `users`, `issues`, and
`states`. Creating an issue requires sign-in; deleting requires ownership
(`resource.data.userId == request.auth.uid`); **updating an issue requires only
sign-in** (any authenticated user). `states` are writable by any signed-in user;
`users/{userId}` are writable only by their owner. See §14 for the implications.

## 10. Setup Instructions

**Prerequisites:** Node.js (a modern LTS) and npm. A Firebase project, a Gemini
API key, and a Google Maps Platform key are required for full functionality.

```bash
# 1. Install dependencies
npm install

# 2. Create a .env.local (or environment) with at least:
#    GEMINI_API_KEY=...               # required for /api/scan
#    GOOGLE_MAPS_PLATFORM_KEY=...      # required or the app shows a key-required screen

# 3. (Server) Provide Firebase Admin credentials via Application Default Credentials,
#    e.g. GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account JSON.
#    (Inferred from applicationDefault() in server.ts — not committed in this repo.)
```

> The Firebase **web** config is already hard-coded in `src/firebase.ts`. To
> point at your own project you must edit that file and update the named
> Firestore database ID in both `src/firebase.ts` and `server.ts`.

## 11. Environment Variables

| Variable | Read in | Purpose | Required? |
|---|---|---|---|
| `GEMINI_API_KEY` | `server.ts` | Authenticates the server-side Gemini client used by `/api/scan`. The endpoint returns a config error if it is missing or left as a placeholder. | Required for AI scanning |
| `GOOGLE_MAPS_PLATFORM_KEY` | `vite.config.ts` → `process.env` in `App.tsx` | Google Maps `APIProvider` key. Without it (or with `YOUR_API_KEY`), the app renders a full-screen "API Key Required" screen and nothing else. | Required to run |
| `VITE_GOOGLE_MAPS_PLATFORM_KEY` | `App.tsx` | Alternative source for the Maps key (Vite client env). | Optional fallback |
| `NODE_ENV` | `server.ts` | When `production`, serves compiled `dist/`; otherwise mounts Vite middleware. | Optional |
| `GOOGLE_APPLICATION_CREDENTIALS` | (implied by `applicationDefault()`) | Service-account credentials for `firebase-admin`. **Inferred** — not referenced by name in the repo. | Required for server Firestore writes |

## 12. Running Locally

```bash
npm run dev
```

This runs `tsx server.ts`, which starts Express on **port 3000** and mounts Vite
in middleware mode. Open `http://localhost:3000`. The dev server logs
"Vite development middleware mounted successfully." and the listening address.

```bash
npm run lint     # tsc --noEmit — type-check only
npm run clean    # rm -rf dist server.js
```

## 13. Build & Deployment

```bash
npm run build    # vite build  +  esbuild server.ts → dist/server.cjs
npm run start    # node dist/server.cjs  (serve dist/ statically + run /api/*)
```

`build` produces a static client bundle via Vite and a bundled CommonJS server
(`dist/server.cjs`, external packages, sourcemaps). `start` runs that server; in
production mode it serves `dist/` and falls back to `index.html` for SPA routes.

## 14. Future Scope & Scalability

The architecture is designed to support large-scale deployment and seamless integration with municipal infrastructure.

- **IoT Sensor Integration:** Combine citizen-submitted reports with real-time telemetry from smart city IoT sensors, such as automated water leak detectors, for improved situational awareness.
- **Smart Contractor Assignment:** Automatically dispatch municipal or private contractors based on AI-assessed hazard severity, resource availability, and geospatial proximity.
- **EXIF Data Enforcement:** Strengthen the geospatial validation pipeline by extracting encrypted EXIF GPS metadata directly from uploaded images to verify capture locations and reduce photo spoofing.

## 15. Credits / License

- **Project:** CivicLens Global — _"Every report moves your state's rank. Worldwide."_
- **Maps:** Google Maps Platform via `@vis.gl/react-google-maps`.
- **AI:** Google Gemini (`@google/genai`, model `gemini-2.5-flash`).
- **Geocoding:** OpenStreetMap **Nominatim** (reverse geocoding). Usage is subject
  to the OSM Nominatim usage policy.
- **Demo imagery:** Unsplash.
- **Scaffolding:** Google AI Studio "Build".

