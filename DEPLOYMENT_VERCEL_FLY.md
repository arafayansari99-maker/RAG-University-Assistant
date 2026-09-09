# Deployment Guide: Vercel + Fly.io

Complete guide to deploy RAG University Assistant for free with no expiry using Vercel (Frontend) and Fly.io (Backend).

## Prerequisites

- GitHub account with your repository pushed
- Node.js 18+ installed locally
- Groq API key (get free at https://console.groq.com)
- Vercel account (free signup at https://vercel.com)
- Fly.io account (free signup at https://fly.io, no credit card required)

---

## Part 1: Deploy Backend to Fly.io

### Step 1: Install Fly CLI

**Windows:**
```powershell
# Download and run installer
irm https://fly.io/install.ps1 | iex
```

**Mac:**
```bash
brew install flyctl
```

**Linux:**
```bash
curl -L https://fly.io/install.sh | sh
```

### Step 2: Authenticate with Fly.io

```bash
flyctl auth signup
# or if you already have account
flyctl auth login
```

### Step 3: Navigate to API Server

```bash
cd artifacts/api-server
```

### Step 4: Create Fly.io Configuration

```bash
flyctl launch
```

You'll be prompted:
- **App name**: `rag-university-api` (or your preferred name)
- **Region**: Choose closest to you (e.g., `iad` for US East)
- **Database**: Select `No`
- **Deploy now?**: Select `No` (we'll set env vars first)

This creates `fly.toml` in your `artifacts/api-server` directory.

### Step 5: Set Environment Variables

```bash
flyctl secrets set GROQ_API_KEY=your_actual_groq_api_key_here
flyctl secrets set PORT=3001
```

To verify secrets are set:
```bash
flyctl secrets list
```

### Step 6: Deploy to Fly.io

```bash
flyctl deploy
```

**Wait for deployment to complete.** You'll see output like:
```
==> Monitoring Deployment
 1 desired, 1 placed, 1 healthy, 0 unhealthy
--> v0 deployed successfully
```

### Step 7: Get Your Fly.io App URL

```bash
flyctl info
```

Look for the URL format: `https://rag-university-api.fly.dev`

Save this URL - you'll need it for the frontend!

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

Add these environment variables:

| Key | Value |
|-----|-------|
| `VITE_API_BASE` | `https://rag-university-api.fly.dev` |

Replace `rag-university-api` with your actual Fly.io app name.

### Step 5: Deploy

Click **"Deploy"** and wait for completion (~2-3 minutes).

Once complete, you'll see your live URL:
```
https://rag-university-assistant.vercel.app
```

---

## Part 3: Verify Deployment

### Test Backend (Fly.io)

```bash
# Health check
curl https://rag-university-api.fly.dev/api/healthz

# Should return 200 OK
```

### Test Frontend (Vercel)

Visit your Vercel URL in browser:
```
https://your-app-name.vercel.app
```

Try asking a question to verify the API connection works.

---

## Part 4: Connect Custom Domain (Optional)

### For Vercel Frontend:
1. Go to Vercel Project Settings
2. Click **"Domains"**
3. Add your custom domain
4. Follow DNS setup instructions

### For Fly.io Backend:
1. Run:
   ```bash
   flyctl certs create rag-api.yourdomain.com
   ```
2. Add CNAME record to your DNS

---

## Monitoring & Management

### View Logs (Fly.io)

```bash
flyctl logs
```

### View Metrics (Fly.io)

```bash
flyctl status
```

### Redeploy (Fly.io)

```bash
cd artifacts/api-server
flyctl deploy
```

### Redeploy (Vercel)

Push to GitHub and Vercel auto-deploys:
```bash
git push origin main
```

---

## Environment Variable Updates

### Update Fly.io Secrets

```bash
flyctl secrets set GROQ_API_KEY=new_key_here
# Auto-redeploys with new env vars
```

### Update Vercel Variables

1. Go to Project Settings → Environment Variables
2. Update values
3. Redeploy (manually or via git push)

---

## Troubleshooting

### Fly.io App Won't Deploy

```bash
# Check logs
flyctl logs

# Rebuild from scratch
flyctl deploy --force-machines
```

### Frontend Can't Reach Backend

1. Verify `VITE_API_BASE` is set correctly in Vercel
2. Check Fly.io app is running:
   ```bash
   flyctl status
   ```
3. Test API directly:
   ```bash
   curl https://your-fly-app.fly.dev/api/healthz
   ```

### Build Fails on Vercel

1. Check root directory is set to `artifacts/rag-university`
2. Verify build command: `pnpm install && pnpm run build`
3. Check output directory: `dist/public`
4. Verify all environment variables are set

---

## Cost & Limits

### Vercel (Free Tier)
- ✅ Unlimited projects & deployments
- ✅ 100GB bandwidth/month
- ✅ Unlimited requests
- ❌ No credit card required

### Fly.io (Free Tier)
- ✅ 3 shared CPU VMs included
- ✅ 160GB outbound data/month
- ✅ No credit card required
- ⚠️ Limited to free tier resources unless upgraded

---

## Auto-Deployment from GitHub

Both Vercel and Fly.io support auto-deployment:

### Vercel Auto-Deploy
- Automatic on every push to main branch
- Enable in Project Settings → Git

### Fly.io Auto-Deploy (Optional)
To enable auto-deploy on push:

```bash
flyctl tokens create deploy --readonly
```

Then add webhook in GitHub repository settings.

---

## Next Steps

1. ✅ Deploy backend to Fly.io
2. ✅ Deploy frontend to Vercel
3. ✅ Test both services
4. ✅ Share URLs with users
5. 📧 Update README with live URLs
6. 🔄 Set up auto-deployment

---

## Quick Reference

| Service | URL | Settings |
|---------|-----|----------|
| Backend | `https://rag-university-api.fly.dev` | `flyctl secrets set` |
| Frontend | `https://your-app.vercel.app` | Vercel Dashboard |
| GitHub | Your repository | Auto-triggers deploys |

---

**Happy Deploying! 🚀**

Last Updated: 2026-09-09
