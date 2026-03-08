# Railway Deployment Guide

## Backend (FastAPI)

### 1. Create a Railway project
1. Go to [railway.app](https://railway.app) → New Project
2. Choose **Deploy from GitHub repo** → select `dealersuite-loaner-inspection`
3. Set **Root Directory** to `backend`

### 2. Add a PostgreSQL database
- Inside your Railway project: **+ New** → **Database** → **PostgreSQL**
- Railway automatically injects `DATABASE_URL` into your backend service

### 3. Set environment variables
In your backend service → Variables tab, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Auto-set by Railway PostgreSQL plugin |
| `JWT_SECRET` | A long random string (use a password generator) |
| `FRONTEND_URL` | Your Railway frontend URL (set after frontend deploys) |
| `GOOGLE_DRIVE_API_KEY` | From Google Cloud Console |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Paste the full JSON content of your service account file |
| `ENVIRONMENT` | `production` |

### 4. Start command
Railway will use the `Procfile` automatically:
```
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### 5. Run migrations after first deploy
In Railway shell (or locally with the Railway DATABASE_URL):
```bash
cd backend
alembic upgrade head
python seed.py    # creates default admin + manager accounts
```

### 6. Verify
Visit `https://your-app.railway.app/health` — should return:
```json
{"status": "ok", "app": "DealerSuite Loaner Inspection", "version": "0.2.0"}
```

---

## Frontend (React / Vite)

### 1. Add a second Railway service
- **+ New** → **Deploy from GitHub repo** → same repo
- Set **Root Directory** to `frontend`

### 2. Set environment variables

| Variable | Value |
|---|---|
| `VITE_API_URL` | Your Railway backend URL (e.g. `https://your-api.railway.app`) |

### 3. Build & publish settings
- **Build command:** `npm run build`
- **Publish directory:** `dist`

### 4. Update backend CORS
Go back to backend service → add your frontend Railway URL to `FRONTEND_URL`.

---

## Local Development

```bash
# Terminal 1 — Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in values
uvicorn main:app --reload

# Terminal 2 — Frontend
cd frontend
npm install
cp .env.example .env.local  # fill in VITE_API_URL=http://localhost:8000
npm run dev
```

Access:
- Frontend: http://localhost:5173
- API docs: http://localhost:8000/docs
- Health:   http://localhost:8000/health
