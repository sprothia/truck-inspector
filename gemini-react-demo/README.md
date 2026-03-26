# Truck inspection (Gemini Live)

## Overview

This project is an **iOS app** (React + Capacitor) for **guided truck inspections** using **Google Gemini Live**. The Gemini Live API allows you to interact with AI in real-time through audio/video. In this app, Gemini **sees a live feed of your camera**, and walks you through a **fixed checklist** (windshield, lights, mirrors, and similar items) so each step gets a clear pass or fail style outcome. The user just aims their camera at the truck part, and Gemini will help you inspect it.

**Purpose:** Give drivers a way to run inspections with **live** AI assistance at the truck, without the friction of manual-only paperwork or slow “upload-and-chat” AI workflows.

**Problem:** Today many drivers still use **manual checklists**—paper or basic apps where they must judge everything themselves and record it by hand. When fleets add **AI**, it often still means **taking photos, uploading them, and typing or chatting** with a model in separate steps. That is **slow**, breaks concentration on the vehicle, invites wrong or incomplete photos, and is **error-prone** compared to staying in one continuous moment at the inspection.

**Solution:** This app uses **Gemini Live** so the whole inspection runs **in real time**. Your **speech** and what the **camera sees right now** go to the model in **one stream**—not a loop of typing findings, attaching images from the gallery, or bouncing between a checklist and a chat window. The model hears you and **sees the live feed as you move**, and replies with **live audio** while you keep working. Everything stays in that **single real-time flow** instead of stitching together messages and files after the fact.

---

## Setup

You need: Node.js, Python 3, Xcode, a physical iPhone, and a **Google Cloud project** where Gemini Live / Vertex is available for your account.

Install the **Google Cloud CLI** so the `gcloud` command exists ([install guide](https://cloud.google.com/sdk/docs/install)). The proxy does not use an API key inside the app; it uses **Application Default Credentials** on the machine where you run `server.py`.

**Network:** Put your **computer and iPhone on the same Wi‑Fi** before you run the app. The phone reaches the proxy on your computer using its **LAN address**, not localhost.

### 1. Go to the app folder and install requirements

```bash
cd gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app
npm install
python3 -m venv venv
source venv/bin/activate
pip3 install -r requirements.txt
```

### 2. Start the WebSocket proxy

The Python proxy signs requests to Google on your behalf. **`gcloud auth application-default login`** stores credentials on **this computer only** so `server.py` can obtain access tokens. It opens a browser window: sign in with the **same Google account** that can use your GCP project (and Vertex / Gemini Live). You do **not** run this on the iPhone; only the Mac (or whatever runs the proxy) needs it. Run it again if you switch accounts or the login expires.

From the app folder, start the proxy server:

```bash
cd gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app
source venv/bin/activate
gcloud auth application-default login
python3 server.py
```

Leave this running. It listens on **port 8080** on your machine.

While the computer stays on that Wi‑Fi, find its **LAN IP** (e.g. System Settings → Network on macOS, or `ipconfig getifaddr en0` in Terminal). You will set `VITE_PROXY_URL` to `ws://<that-ip>:8080` in the next step.

### 3. Configure `.env`

Open a **second** terminal (keep the proxy running). In the same app folder:

```bash
cp .env.example .env
```

Edit `.env`:

- **`VITE_PROXY_URL`** — `ws://YOUR_COMPUTER_LAN_IP:8080`. Use the IP from step 2. The iPhone must be on the **same Wi‑Fi** as the computer so it can open that address.
- **`VITE_PROJECT_ID`** — your GCP project ID.

Optional: `VITE_MODEL`, `VITE_VOICE`, `VITE_VOLUME` (defaults are in `.env.example`).

Do not commit `.env`.

### 4. Build and run on iOS in the second terminal

```bash
npm run ios
```

In Xcode, select your **iPhone** (not a simulator), set signing, run.

`npm run ios` builds the web app, syncs Capacitor, and opens Xcode.
