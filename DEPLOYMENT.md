# Deployment Guide - SARI Textile Warehouses Accounting

This guide helps you upload the project to GitHub and deploy it.

## Step 1: Configure Git (one-time setup)

Before your first commit, set your Git identity:

```bash
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

Use the same email as your GitHub account, or use GitHub's private email: `username@users.noreply.github.com`

## Step 2: Create the initial commit

```bash
cd "C:\Users\Abdullah\Desktop\apps\cursor2 app"
git add .
git commit -m "Initial commit: Multi-market used clothes wholesale accounting system"
```

## Step 3: Create a GitHub repository

1. Go to [github.com](https://github.com) and sign in
2. Click the **+** icon → **New repository**
3. Name it (e.g. `sari-accounting` or `cursor2-app`)
4. Choose **Public** or **Private**
5. **Do NOT** initialize with README (you already have one)
6. Click **Create repository**

## Step 4: Push to GitHub

After creating the repo, GitHub will show you commands. Use these (replace `YOUR_USERNAME` and `YOUR_REPO` with your values):

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

Or if you use SSH:

```bash
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

## Step 5: Deployment options

### Option A: Railway
- Connect your GitHub repo at [railway.app](https://railway.app)
- Add PostgreSQL (or keep SQLite for small deployments)
- Set `DATABASE_URL` if using PostgreSQL
- Deploy

### Option B: Render
- Connect repo at [render.com](https://render.com)
- Create a new Web Service
- Build: `pip install -r requirements.txt`
- Start: `gunicorn app:app` (add gunicorn to requirements.txt)

### Option C: PythonAnywhere
- Upload via GitHub import
- Configure WSGI to point to `app:app`
- Use SQLite or add MySQL

### Option D: VPS (DigitalOcean, AWS, etc.)
- Clone repo on server
- Set up Python, install dependencies
- Use gunicorn + nginx
- Consider PostgreSQL for production

## Important: Before deploying to production

1. **Change SECRET_KEY** in `app.py` – use a long random string
2. **Use environment variables** for `SECRET_KEY` and `DATABASE_URL`
3. **Use PostgreSQL** instead of SQLite for production (better concurrency)
4. **Enable HTTPS** – most platforms do this automatically

## Need help?

After you run the git config commands and create your GitHub repo, I can help you with the push command and deployment setup.
