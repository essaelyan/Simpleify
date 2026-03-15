# AI Marketing Engine — Claude Code Context

## Project Overview
A multi-tenant SaaS platform that generates AI-powered marketing content (images, carousels, reels, stories) and schedules them to social media via Buffer.

## Stack
| Layer | Tech |
|-------|------|
| Backend API | FastAPI + Python 3.14 |
| Database | PostgreSQL 16 (asyncpg + SQLAlchemy 2 async) |
| Migrations | Alembic |
| Task Queue | Celery + Redis |
| Storage | Local (dev) / Google Cloud Storage (prod) |
| AI | Gemini 1.5 Pro/Flash, Imagen 3, Claude (Anthropic), Kling AI (video) |
| Scheduling | Buffer API |
| Payments | Stripe |
| Frontend | Next.js 16 + TypeScript + Tailwind CSS |
| State | Zustand |
| HTTP client | Axios |

## Project Structure
```
ai-marketing-engine/
├── backend/
│   ├── main.py              # FastAPI app entrypoint
│   ├── config.py            # Pydantic settings (reads .env)
│   ├── .env                 # Environment variables (never commit)
│   ├── alembic/             # DB migrations
│   ├── api/v1/              # Route handlers
│   ├── core/                # Auth, security, dependencies
│   ├── db/
│   │   ├── base.py          # SQLAlchemy base
│   │   └── models/          # ORM models (tenant.py, user.py, ...)
│   ├── schemas/             # Pydantic request/response schemas
│   ├── services/            # Business logic
│   ├── tasks/               # Celery async tasks
│   ├── ai/                  # AI model integrations
│   └── utils/               # Shared helpers
├── frontend/
│   ├── src/
│   │   ├── pages/           # Next.js pages router
│   │   ├── components/      # React components
│   │   ├── store/           # Zustand stores
│   │   ├── api/             # Axios API client modules
│   │   └── types/           # TypeScript types
│   ├── .env.local           # Frontend env vars
│   └── tailwind.config.js
├── storage/                 # Local media storage (dev)
└── docker-compose.yml       # Postgres + Redis

```

## Running Locally

### 1. Start infrastructure
```bash
docker compose up -d
```

### 2. Backend
```bash
cd backend
pip install -r requirements.txt   # if requirements.txt exists
alembic upgrade head               # run migrations
python -m uvicorn main:app --reload --port 8000
```

### 3. Celery worker
```bash
cd backend
celery -A tasks worker --loglevel=info
```

### 4. Frontend
```bash
cd frontend
npm run dev   # runs on http://localhost:3000
```

## Key Conventions
- All DB access is **async** (asyncpg + SQLAlchemy async session)
- Multi-tenant: every model has a `tenant_id` FK
- Auth: JWT access + refresh tokens via `python-jose`
- Passwords: hashed with `passlib[bcrypt]`
- Logging: `structlog` structured JSON logs
- Rate limiting: `slowapi` on sensitive endpoints
- Config: all settings come from `config.py` → `settings` singleton — never hardcode values
- Frontend API calls go through `src/api/` modules (Axios instances), never fetch directly in components

## Environment
- Backend `.env` lives at `backend/.env`
- Frontend env lives at `frontend/.env.local`
- Docker services: Postgres on `localhost:5432`, Redis on `localhost:6379`
