# Deployment Guide: Vercel + Replit

Complete guide to deploy RAG University Assistant for free with NO credit card using Vercel (Frontend) and Replit (Backend).

## Prerequisites

- GitHub account with your repository pushed
- Vercel account (free signup at https://vercel.com, no card needed)
- Replit account (free signup at https://replit.com, no card needed)
- Groq API key (get free at https://console.groq.com)

---

## Part 1: Deploy Backend to Replit

### Step 1: Sign Up on Replit

1. Go to https://replit.com
2. Click **"Sign up"**
3. Choose sign-up method:
   - Email
   - GitHub (recommended - easier)
   - Google
4. Complete signup

### Step 2: Create New Replit

1. Click **"Create"** (top left)
2. Click **"Import from GitHub"**
3. Paste your repository URL:
   ```
   https://github.com/your-username/RAG-University-Assistant
   ```
4. Click **"Import from GitHub"**

### Step 3: Configure Replit

Once imported:

1. **Select Directory to Run**
   - Click `.replit` file (or create one)
   - Set run command:
     ```
     cd artifacts/api-server && pnpm install && pnpm run start
     ```

2. **Set Environment Variables**
   - Click **"Secrets"** (lock icon on left)
   - Add secrets:
     ```
     GROQ_API_KEY=your_actual_groq_api_key_here
     PORT=3001
     NODE_ENV=production
     ```

3. **Install Dependencies**
   ```bash
   pnpm install
   cd artifacts/api-server
   pnpm install
   pnpm run build
   ```

### Step 4: Run the App

1. Click **"Run"** button at top
2. Wait for build to complete
3. A new terminal will open showing:
   ```
   Server running on http://localhost:3001
   ```

### Step 5: Get Your Replit URL

When running, Replit shows a URL at the top like:
```
https://rag-university-api.your-username.repl.co
```

**Save this URL** - you'll need it for Vercel!

**Note:** This URL is only active when you click "Run". To keep it always on:
- Click **"Always On"** (requires Replit subscription or it spins down)
- Free tier: App goes dormant after 1 hour of no requests (~30s to wake up)

---

## Part 2: Deploy Frontend to Vercel

### Step 1: Go to Vercel

Visit https://vercel.com and sign in with GitHub.

### Step 2: Import Repository

1. Click **"Add New..."** → **"Project"**
2. Select your GitHub repository `RAG-University-Assistant`
3. Click **"Import"**

### Step 3: Configure Project Settings

In the "Configure Project" screen:

**Framework:** Vite
**Root Directory:** `artifacts/rag-university`

**Build Settings:**
- **Build Command:** 
  ```
  pnpm install && pnpm run build
  ```
- **Output Directory:** 
  ```
  dist/public
  ```
- **Install Command:** 
  ```
  pnpm install
  ```

### Step 4: Set Environment Variables

Add environment variable:

| Key | Value |
|-----|-------|
| `VITE_API_BASE` | `https://rag-university-api.your-username.repl.co` |

Replace `your-username` with your actual Replit username.

### Step 5: Deploy

Click **"Deploy"** and wait for completion (~2-3 minutes).

Once complete, you'll see your live URL:
```
https://rag-university-assistant.vercel.app
```

---

## Part 3: Verify Deployment

### Test Backend (Replit)

1. Make sure Replit is running (click **"Run"** if needed)
2. Test health endpoint:
   ```bash
   curl https://rag-university-api.your-username.repl.co/api/healthz
   ```
   Should return `200 OK`

### Test Frontend (Vercel)

Visit your Vercel URL in browser:
```
https://rag-university-assistant.vercel.app
```

Try asking a question to verify the API connection works.

---

## Important Notes

### Replit Limitations

- **Free tier:** App spins down after 1 hour of no activity
- **Wake up time:** ~30 seconds when accessed after dormancy
- **Resource limits:** 0.5vCPU, 128MB RAM (adequate for this app)
- **Always-on:** Requires paid plan

### Keep It Running

To minimize dormancy:

**Option 1: Uptime Monitoring**
```bash
# Use an uptime monitor like UptimeRobot
# Ping your Replit URL every 5 minutes
# This keeps it "alive"
```

Visit: https://uptimerobot.com (free tier available)
1. Create monitor for: `https://rag-university-api.your-username.repl.co/api/healthz`
2. Set interval: 5 minutes
3. Replit stays active 24/7!

**Option 2: Accept Spin-Down**
- Just live with 30s wake-up time
- Users won't notice much after first question

---

## Auto-Deployment

### Vercel Auto-Deploy
- Automatic on every push to main branch
- Enabled by default

### Replit Auto-Deploy
- Manual redeploy needed after code changes
- Click **"Run"** again to rebuild

**To redeploy after GitHub updates:**
```bash
# In Replit console
pnpm install
cd artifacts/api-server
pnpm install
pnpm run build
# Then click Run again
```

---

## Cost & Limits

### Vercel (Free Tier)
- ✅ Unlimited projects & deployments
- ✅ 100GB bandwidth/month
- ✅ Unlimited requests
- ❌ No credit card required

### Replit (Free Tier)
- ✅ 1 repl (create account)
- ✅ 0.5vCPU, 128MB RAM per repl
- ✅ Spins down after 1 hour idle
- ❌ No credit card required

**Total Cost:** $0/month, no expiry

---

## Troubleshooting

### Replit Build Fails

1. Check node version:
   ```bash
   node --version
   ```
   Should be 18+

2. Clear cache and rebuild:
   ```bash
   rm -rf node_modules package-lock.yaml
   pnpm install
   ```

3. Check logs in Replit console

### Frontend Can't Reach Backend

1. Verify `VITE_API_BASE` in Vercel environment variables
2. Ensure it matches your Replit URL exactly
3. Test URL manually in browser:
   ```
   https://rag-university-api.your-username.repl.co/api/healthz
   ```
4. Make sure Replit is running (click **"Run"**)

### Build Fails on Vercel

1. Check root directory: `artifacts/rag-university`
2. Verify build command: `pnpm install && pnpm run build`
3. Check output directory: `dist/public`
4. View build logs in Vercel dashboard

### Replit URL Not Working

- Replit might be spinning down
- Click **"Run"** to wake it up
- Wait 30-60 seconds for it to start
- Try again

---

## Quick Reference

| Service | URL | Notes |
|---------|-----|-------|
| Backend | `https://rag-university-api.your-username.repl.co` | Keep running with UptimeRobot |
| Frontend | `https://your-app.vercel.app` | Auto-deploys on push |
| GitHub | Your repository | Triggers Vercel deploys |

---

## Next Steps

1. ✅ Sign up on Replit
2. ✅ Import repository
3. ✅ Set environment variables
4. ✅ Run backend
5. ✅ Get Replit URL
6. ✅ Deploy frontend to Vercel
7. ✅ Set Vercel environment variable
8. ✅ Test both services
9. ✅ (Optional) Setup UptimeRobot for always-on

---

**Happy Deploying! 🚀**

Last Updated: 2026-09-10
