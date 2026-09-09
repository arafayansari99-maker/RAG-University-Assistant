# Quick Start: Vercel + Replit Deployment

Deploy RAG University Assistant in 15 minutes with **NO credit card required**.

## Pre-Deployment Checklist

- [ ] GitHub account with repo pushed
- [ ] Groq API key (get free at https://console.groq.com)
- [ ] Vercel account (signup at https://vercel.com, no card)
- [ ] Replit account (signup at https://replit.com, no card)

---

## Backend Deployment (Replit) - 5 Minutes

### 1. Sign Up on Replit
- Go to https://replit.com
- Click **"Sign up"** → Choose GitHub
- Authorize GitHub access

### 2. Import Your Repository
- Click **"Create"**
- Click **"Import from GitHub"**
- Paste: `https://github.com/your-username/RAG-University-Assistant`
- Click **"Import from GitHub"**

### 3. Set Environment Variables
- Click **"Secrets"** (lock icon on left sidebar)
- Add these secrets:
  ```
  GROQ_API_KEY = your_actual_key_here
  PORT = 3001
  NODE_ENV = production
  ```

### 4. Configure Run Command
- Click `.replit` file (or create it)
- Set content:
  ```
  run = "cd artifacts/api-server && pnpm install && pnpm run start"
  ```

### 5. Install & Run
```bash
pnpm install
cd artifacts/api-server
pnpm install
pnpm run build
```

Then click **"Run"** button at top.

### 6. Get Your URL
When it starts, you'll see:
```
https://rag-university-api.your-username.repl.co
```

**⭐ Copy and save this URL!**

---

## Frontend Deployment (Vercel) - 5 Minutes

### 1. Go to Vercel
- Visit https://vercel.com
- Sign in with GitHub

### 2. Import Repository
- Click **"Add New..."** → **"Project"**
- Select `RAG-University-Assistant`
- Click **"Import"**

### 3. Configure Settings

**Root Directory:**
```
artifacts/rag-university
```

**Build Command:**
```
pnpm install && pnpm run build
```

**Output Directory:**
```
dist/public
```

### 4. Set Environment Variable

Add environment variable:
```
VITE_API_BASE = https://rag-university-api.your-username.repl.co
```

(Replace `your-username` with your actual Replit username)

### 5. Deploy
Click **"Deploy"** → Wait 2-3 minutes → Done!

Your URL:
```
https://your-project.vercel.app
```

---

## Test Your Deployment

### 1. Test Backend
Make sure Replit is running (click **"Run"** if needed).

```bash
curl https://rag-university-api.your-username.repl.co/api/healthz
```

Should return `200 OK`.

### 2. Test Frontend
Visit in browser:
```
https://your-project.vercel.app
```

Try asking a question → Should see response from your backend!

---

## Important: Keep Replit Running

Replit's free tier spins down after 1 hour of no activity.

### Option 1: UptimeRobot (Recommended)
Use free uptime monitoring to keep it alive:

1. Go to https://uptimerobot.com
2. Sign up (free)
3. Create new monitor:
   - Type: HTTP(s)
   - URL: `https://rag-university-api.your-username.repl.co/api/healthz`
   - Interval: 5 minutes
4. Save
5. Replit stays active 24/7!

### Option 2: Accept Spin-Down
- App sleeps after 1 hour
- Wakes up in ~30s when accessed
- Users experience brief delay on first question

---

## Live URLs After Deployment

| Service | URL |
|---------|-----|
| **Frontend** | `https://your-project.vercel.app` |
| **Backend** | `https://rag-university-api.your-username.repl.co` |
| **Health Check** | `https://rag-university-api.your-username.repl.co/api/healthz` |

---

## Auto-Updates

### Vercel Auto-Updates
```bash
git push origin main
# → Vercel auto-deploys frontend
```

### Replit Manual Updates
After pushing to GitHub:
1. Go to your Replit
2. Click **"Pull from GitHub"** (sync button)
3. Click **"Run"** to rebuild and restart

---

## Cost Summary

| Service | Cost | No Card |
|---------|------|---------|
| Vercel | **FREE** | ✅ Yes |
| Replit | **FREE** | ✅ Yes |
| UptimeRobot | **FREE** | ✅ Yes |
| **Total** | **$0/month** | ✅ No expiry |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Replit won't start | Click "Run", check console logs, verify Node.js 18+ |
| Can't reach backend | Verify Replit URL in `VITE_API_BASE`, ensure Replit is running |
| Frontend build fails | Check root directory is `artifacts/rag-university`, verify build command |
| Replit keeps spinning down | Setup UptimeRobot to keep it alive |

---

## Complete - You're Live! 🎉

Your RAG University Assistant is now deployed for free with no credit card required!

- Share frontend URL with users
- Monitor backend health with UptimeRobot
- Auto-deploy future updates with git push

**Questions?** See `DEPLOYMENT_VERCEL_REPLIT.md` for detailed instructions.

Last Updated: 2026-09-10
