# Quick Deployment Checklist

Complete this checklist to deploy your RAG University Assistant to Vercel + Fly.io.

## Pre-Deployment Checklist

- [ ] GitHub repository is up to date (`git push origin main`)
- [ ] You have a Groq API key (get free at https://console.groq.com)
- [ ] You have a Vercel account (signup at https://vercel.com)
- [ ] You have a Fly.io account (signup at https://fly.io)
- [ ] Node.js 18+ is installed
- [ ] Fly CLI is installed (`flyctl version`)

---

## Backend Deployment (Fly.io) - 10 Minutes

### Step 1: Setup Fly.io CLI
```bash
# Verify installation
flyctl version

# Login to Fly.io
flyctl auth login
```

### Step 2: Initialize Fly App
```bash
cd artifacts/api-server
flyctl launch --name rag-university-api
```

**Answers to prompts:**
- App name: `rag-university-api` (or your choice)
- Region: Choose closest to you (e.g., `iad` for US East)
- Database: **No**
- Deploy now: **No**

### Step 3: Set Secrets
```bash
flyctl secrets set GROQ_API_KEY=your_actual_key_here
flyctl secrets set PORT=3001
```

### Step 4: Deploy
```bash
flyctl deploy
```

### Step 5: Get Your URL
```bash
flyctl info
```

**Save this URL:** `https://rag-university-api.fly.dev` (or your app name)

---

## Frontend Deployment (Vercel) - 5 Minutes

### Step 1: Go to Vercel
Visit: https://vercel.com/new

### Step 2: Import Repository
1. Click **"Select GitHub Account"**
2. Find and select **`RAG-University-Assistant`**
3. Click **"Import"**

### Step 3: Configure Settings

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

**Environment Variables:**
```
VITE_API_BASE = https://rag-university-api.fly.dev
```
(Replace with your actual Fly.io URL)

### Step 4: Deploy
Click **"Deploy"** and wait 2-3 minutes.

---

## Post-Deployment Verification

### Test Backend
```bash
curl https://rag-university-api.fly.dev/api/healthz
```
Should return `200 OK`.

### Test Frontend
Visit: `https://your-project.vercel.app`

Try asking a question to verify API connection works.

---

## Live URLs

After deployment, you'll have:

| Service | URL |
|---------|-----|
| **Frontend** | `https://your-project.vercel.app` |
| **Backend** | `https://rag-university-api.fly.dev` |
| **API Health** | `https://rag-university-api.fly.dev/api/healthz` |

---

## Troubleshooting

### Fly.io Deploy Fails
```bash
flyctl logs
```

### Vercel Can't Find API
1. Check `VITE_API_BASE` environment variable in Vercel dashboard
2. Verify Fly.io app is running: `flyctl status`
3. Test health endpoint manually

### CORS Issues
1. Check API logs: `flyctl logs`
2. Ensure frontend URL is allowed in Express CORS config

---

## Auto-Updates

**Both services auto-deploy on push to main:**
```bash
git push origin main
# → Vercel auto-deploys frontend
# → Fly.io doesn't auto-deploy (requires webhook setup)
```

**To manually redeploy:**
```bash
flyctl deploy  # Fly.io
# or just push to GitHub for Vercel
```

---

## Cost Summary

| Service | Cost | Limits |
|---------|------|--------|
| Vercel | **FREE** | 100GB/mo bandwidth |
| Fly.io | **FREE** | 3 shared CPU VMs |
| **Total** | **$0/month** | No expiry |

---

## Next Steps

1. ✅ Complete pre-deployment checklist
2. ✅ Deploy backend to Fly.io
3. ✅ Deploy frontend to Vercel
4. ✅ Verify both services work
5. 📧 Share URLs with users/stakeholders
6. 📚 Update README with live URLs

---

**Questions?** See `DEPLOYMENT_VERCEL_FLY.md` for detailed instructions.

Last Updated: 2026-09-09
