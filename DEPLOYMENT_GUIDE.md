# 🚀 ProTrader Platform - Vercel & Production Deployment Guide

This guide provides step-by-step instructions for deploying the **ProTrader Platform** to **Vercel** and other cloud providers.

---

## 📋 Table of Contents
1. [Architecture Overview & Platform Comparison](#1-architecture-overview)
2. [Step-by-Step Vercel Deployment](#2-step-by-step-vercel-deployment)
3. [MongoDB Atlas Setup Guide](#3-mongodb-atlas-setup-guide)
4. [Environment Variables Reference](#4-environment-variables-reference)
5. [AI Chatbot Deployment](#5-ai-chatbot-deployment)
6. [Post-Deployment Verification Checklist](#6-post-deployment-verification-checklist)

---

## 1. 🏗️ Architecture Overview

The ProTrader project consists of two core components:

| Component | Technology | Default Port | Recommended Hosting |
| :--- | :--- | :--- | :--- |
| **Main Platform (Super-Server)** | Node.js, Express, WebSockets, MongoDB, HTML5/CSS3 | `3000` | **Vercel** (Serverless) or **Render / Railway** (Persistent) |
| **AI Financial Chatbot** | Node.js Express / Python FastAPI + Ollama | `3001` | **Render / Railway / VPS** |

### ⚡ Vercel vs Render/Railway Comparison
- **Vercel (Serverless)**:
  - ✅ Global CDN distribution, instant HTTPS, zero-config builds.
  - ✅ Handles all static assets, landing page, login, pricing, REST API endpoints, JWT auth, and Razorpay payments.
  - ⚠️ *Note on WebSockets*: Serverless functions do not keep persistent WebSocket connections open. The frontend terminal automatically falls back to HTTP polling for real-time market data updates every 4–5 seconds.
- **Render / Railway / Fly.io (Persistent Container/Node.js)**:
  - ✅ Supports persistent WebSocket streaming (`/market/ws`).
  - ✅ Can run both the Super-Server and the Chatbot Backend 24/7.

---

## 2. 🚀 Step-by-Step Vercel Deployment

### Method A: Deploy via GitHub (Recommended)

1. **Commit and Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "feat: prepare project for Vercel deployment with vercel.json and serverless handlers"
   git push origin main
   ```

2. **Import into Vercel**:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard).
   - Click **"Add New..."** &rarr; **"Project"**.
   - Select your GitHub repository (`trading-platform.clg`).

3. **Configure Project Settings**:
   - **Framework Preset**: Leave as **Other** (Vercel automatically detects `vercel.json`).
   - **Root Directory**: `./` (Root).
   - **Build Command**: Leave empty or default.
   - **Output Directory**: Leave empty or default.

4. **Add Environment Variables** (Under **Environment Variables**):
   | Variable | Value | Description |
   | :--- | :--- | :--- |
   | `MONGODB_URI` | `mongodb+srv://<user>:<password>@cluster.mongodb.net/trading?...` | Your MongoDB Atlas connection URI |
   | `JWT_SECRET` | `protrader_production_jwt_secret_key_2026_super_secure` | Secure random string for JWT |
   | `JWT_EXPIRES_IN` | `7d` | Session expiration duration |
   | `RAZORPAY_KEY_ID` | `rzp_test_S0aRTlHDRju4RM` | Razorpay Key ID |
   | `RAZORPAY_KEY_SECRET` | `1oo9T8Tb0yFMdit7nU4s12Rg` | Razorpay Secret |

5. **Deploy**:
   - Click **"Deploy"**.
   - Wait 30–60 seconds for build and deployment completion.
   - You will receive a live production URL: `https://your-project.vercel.app`.

---

### Method B: Deploy via Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Login and Deploy**:
   ```bash
   vercel login
   vercel
   ```

3. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

---

## 3. 🍃 MongoDB Atlas Setup Guide

To ensure persistent account balances, user profiles, and order history across serverless invocations:

1. **Create Free MongoDB Atlas Account**:
   - Visit [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
   - Create a free **M0 Shared Cluster**.
2. **Network Access (Critical)**:
   - Go to **Network Access** &rarr; **Add IP Address**.
   - Choose **"Allow Access from Anywhere"** (`0.0.0.0/0`). This allows Vercel's distributed serverless functions to connect.
3. **Database User**:
   - Go to **Database Access** &rarr; **Add New Database User**.
   - Create username and strong password with **Read and write to any database** privilege.
4. **Copy Connection String**:
   - Click **Connect** &rarr; **Drivers** &rarr; **Node.js**.
   - Copy the URI:
     `mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/trading?retryWrites=true&w=majority`
   - Paste this into Vercel's `MONGODB_URI` environment variable.

> **💡 In-Memory Fallback**: If you deploy without setting `MONGODB_URI`, ProTrader automatically runs in **In-Memory Mode** without crashing. Demo trading, auth, and analytics will remain fully functional for the lifetime of the session.

---

## 4. 🔑 Environment Variables Reference

A pre-configured template is available in [`.env.example`](file:///.env.example):

```env
PORT=3000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/trading?retryWrites=true&w=majority
JWT_SECRET=protrader_production_jwt_secret_key_2026_super_secure
JWT_EXPIRES_IN=7d
RAZORPAY_KEY_ID=rzp_test_S0aRTlHDRju4RM
RAZORPAY_KEY_SECRET=1oo9T8Tb0yFMdit7nU4s12Rg
```

---

## 5. 🤖 AI Chatbot Deployment

The AI Financial Assistant backend is located in [`chatbot-backend/`](file:///chatbot-backend/):

### Option 1: Deploy to Render / Railway (Recommended for Chatbot)
1. In your GitHub repository, create a new Web Service on Render targeting the `chatbot-backend` directory.
2. Build command: `npm install`
3. Start command: `node server.js`
4. Copy the resulting public URL (e.g., `https://protrader-bot.onrender.com`).
5. Update `BACKEND_URL` in [`chatbot-widget-minimal.html`](file:///chatbot-widget-minimal.html) and [`chatbot-demo.html`](file:///chatbot-demo.html).

---

## 6. ✅ Post-Deployment Verification Checklist

After deploying to Vercel, verify these endpoints on your live domain:

| Test | Target URL | Expected Result |
| :--- | :--- | :--- |
| **Health Check** | `https://your-domain.vercel.app/health` | HTTP 200 `{"status": "UP"}` |
| **Landing Page** | `https://your-domain.vercel.app/` | Hero section, options trading overview |
| **Sign In** | `https://your-domain.vercel.app/login.html` | Click demo credentials &rarr; Sign In &rarr; redirects to terminal |
| **Trading Terminal** | `https://your-domain.vercel.app/terminal.html` | Live candlestick chart, watchlist, ₹100,000 equity |
| **Pricing / VIP** | `https://your-domain.vercel.app/pricing.html` | Subscription tiers, Razorpay checkout modal |
| **Market Quotes API** | `https://your-domain.vercel.app/api/market-data` | Multi-asset JSON payload (stocks, crypto, commodities) |
