# NaijaLivestock (naijalivestock.com)

> **Buy and Sell Livestock Across Nigeria — Trusted, Verified, and Straightforward.**

NaijaLivestock is a digital agricultural marketplace built specifically for the Nigerian livestock ecosystem. It connects approved local farms with buyers for cattle, goats, sheep, poultry, fish, and other livestock with transparent health records, direct messaging, counter-offers, and seller KYC verification.

---

## 👥 Leadership & Project Identity

- **Domain**: [naijalivestock.com](https://naijalivestock.com)
- **Founder**: Ike Okuzu (`ike.okuzu@naijalivestock.com`)
- **Co-founder**: Mbaja Chizoba (`mbaja.chizoba@naijalivestock.com`)

---

## 🏗️ Architecture & Monorepo Structure

This project is organized as a `pnpm` monorepo:

```text
naijalivestock/
├── artifacts/
│   ├── api-server/         # Express 5 REST API server (port 5000)
│   └── naija-livestock/    # React 19 + Vite frontend web app (port 3000)
├── lib/
│   ├── api-spec/           # OpenAPI 3.1.0 specifications & Orval configuration
│   ├── api-zod/            # Generated Zod validation schemas
│   ├── api-client-react/   # Generated TanStack React Query hooks & fetch client
│   └── db/                 # PostgreSQL schema (Drizzle ORM) & seed scripts
├── .env.example            # Canonical environment variable template
├── pnpm-workspace.yaml     # pnpm workspace configuration & dependency catalog
└── package.json            # Monorepo root scripts
```

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons, Radix UI, TanStack React Query, Wouter
- **Backend**: Node.js 20+, Express 5, Pino logging, Rate limiting
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Clerk (`@clerk/react`, `@clerk/express`)
- **API Spec & Codegen**: OpenAPI 3.1.0 with Orval and Zod
- **Package Manager**: `pnpm`

---

## 🚀 Exact Local Startup Steps

Follow these exact steps to run the complete stack on your local machine:

### Prerequisites

Ensure you have installed:
- **Node.js**: v20.x or v22.x+
- **pnpm**: v9.x or v10.x (`npm install -g pnpm`)
- **PostgreSQL**: A running instance (local or hosted like Supabase / Neon / Railway)

---

### Step 1: Configure Environment Variables

Copy the `.env.example` file to create `.env`:

```bash
cp .env.example .env
```

Open `.env` in your editor and provide:
1. `DATABASE_URL`: Your PostgreSQL connection string:
   ```env
   DATABASE_URL=postgresql://postgres:password@localhost:5432/naijalivestock
   ```
2. `VITE_CLERK_PUBLISHABLE_KEY` & `CLERK_SECRET_KEY`:
   - Create a free project at [clerk.com](https://clerk.com).
   - Paste the test keys into `.env`.
3. `MOCK_PHONE_VERIFICATION=true`:
   - Keep this enabled for local testing (allows verifying any phone using the code `123456`).

---

### Step 2: Install Dependencies

Run from the root directory:

```bash
pnpm install
```

---

### Step 3: Setup & Seed the Database

1. Push the Drizzle database schema to your PostgreSQL database:
   ```bash
   pnpm --filter @workspace/db run push
   ```

2. Seed the database with sample Nigerian livestock listings (cattle, goats, poultry, fish):
   ```bash
   pnpm --filter @workspace/db run seed:marketplace
   ```

---

### Step 4: Start the API Server

In your first terminal window, start the backend API:

```bash
# Windows PowerShell
$env:PORT="5000"; pnpm --filter @workspace/api-server run dev

# Linux / macOS
PORT=5000 pnpm --filter @workspace/api-server run dev
```

The server will start listening at: **`http://localhost:5000`**  
Healthcheck endpoint: **`http://localhost:5000/api/healthz`**

---

### Step 5: Start the Frontend Application

In a second terminal window, start the Vite development server:

```bash
# Windows PowerShell
$env:PORT="3000"; $env:BASE_PATH="/"; pnpm --filter @workspace/naija-livestock run dev

# Linux / macOS
PORT=3000 BASE_PATH="/" pnpm --filter @workspace/naija-livestock run dev
```

The frontend will start at: **`http://localhost:3000`**  
The Vite dev server automatically proxies all `/api/*` calls directly to `http://localhost:5000`.

---

## 📱 Development Mock Phone Verification

In production, phone verification protects the marketplace against fraud. For local development and testing, a secure dev-only mock mode is built-in:

1. During account onboarding at `/account/setup`, enter any Nigerian phone number (e.g. `+2348012345678`).
2. Click **"Send verification code"**.
3. When prompted, enter the code: **`123456`**.
4. Click **"Check code"** — your phone will immediately be marked verified in the database.

> **🔒 Safety Guarantee**: The mock verification logic checks `process.env.NODE_ENV !== "production"`. It is strictly impossible to enable or trigger in production, even if the environment variable is present.

---

## 🛡️ Setting Up Admin Access (Founder & Co-founder)

To grant admin privileges to **Ike Okuzu** and **Mbaja Chizoba**:

1. Sign up on the local app or at `naijalivestock.com` using:
   - `ike.okuzu@naijalivestock.com`
   - `mbaja.chizoba@naijalivestock.com`
2. Open the [Clerk Dashboard](https://dashboard.clerk.com) -> **Users**.
3. Copy the respective **User IDs** (format: `user_2xxxxxxxxxxxx`).
4. Add them to `.env` as a comma-separated list:
   ```env
   MARKETPLACE_ADMIN_IDS=user_founder_id_here,user_cofounder_id_here
   ```
5. Restart the API server. These users will now have access to the `/admin` moderation desk to approve/reject seller KYC and review marketplace disputes.

---

## 🌐 Free Zero-Budget Deployment Guide (Netlify + Render + Neon)

You can launch `naijalivestock.com` live on a **\$0/month budget** by pairing Netlify (Frontend CDN), Render (Backend Web Service), and Neon/Supabase (Free Managed PostgreSQL):

### Architecture Summary

```
                      ┌───────────────────────────────────────┐
                      │    Domain: naijalivestock.com         │
                      └──────────────────┬────────────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
       ┌───────────────────────┐                   ┌───────────────────────┐
       │     NETLIFY (Free)    │                   │      RENDER (Free)    │
       │   React 19 Frontend   │──/api/* proxy────▶│   Express 5 Backend   │
       │  (Global Edge CDN)    │                   │   (Node Web Service)  │
       └───────────────────────┘                   └───────────┬───────────┘
                                                               │
                                                               ▼
                                                   ┌───────────────────────┐
                                                   │ NEON / SUPABASE (Free)│
                                                   │  Managed PostgreSQL   │
                                                   └───────────────────────┘
```

### 1. Database (\$0/mo) — Neon or Supabase
- Sign up at [neon.tech](https://neon.tech) or [supabase.com](https://supabase.com).
- Create a free PostgreSQL project (gives you 500MB storage, which is plenty for thousands of listings).
- Copy your PostgreSQL connection string (`DATABASE_URL`).
- Push your schema once locally or in CI: `DATABASE_URL="..." pnpm --filter @workspace/db run push`.

### 2. Backend (\$0/mo) — Render Web Service
- Sign up at [render.com](https://render.com).
- Click **New** -> **Blueprint** and connect your GitHub repository (Render will automatically read [`render.yaml`](render.yaml)).
- Alternatively, create a **Web Service**:
  - **Build Command**: `pnpm --filter @workspace/api-server run build`
  - **Start Command**: `pnpm --filter @workspace/api-server run start`
  - **Health Check Path**: `/api/healthz`
  - **Environment Variables**: Add `DATABASE_URL`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `MARKETPLACE_ADMIN_IDS`.
- Once deployed, copy your Render API URL (e.g., `https://naijalivestock-api.onrender.com`).

### 3. Frontend (\$0/mo) & Custom Domain — Netlify
- Sign up at [netlify.com](https://netlify.com) and click **Add new site** -> **Import an existing project**.
- Select your repo (Netlify reads [`netlify.toml`](netlify.toml) automatically):
  - **Base directory**: `.`
  - **Build command**: `pnpm --filter @workspace/naija-livestock run build`
  - **Publish directory**: `artifacts/naija-livestock/dist/public`
- **Environment Variables**: Add `VITE_CLERK_PUBLISHABLE_KEY`.
- In [`netlify.toml`](netlify.toml) (or Netlify UI), update the `/api/*` redirect target to point to your Render API URL:
  ```toml
  [[redirects]]
    from = "/api/*"
    to = "https://your-render-app.onrender.com/api/:splat"
    status = 200
    force = true
  ```
- Go to **Domain Management** in Netlify -> Add custom domain: `naijalivestock.com`.
- Follow Netlify's DNS instructions to point your domain (free SSL certificate provisioned automatically).

---


## 📜 Helpful Repository Commands

| Command | Description |
| :--- | :--- |
| `pnpm run typecheck` | Run TypeScript type checks across all monorepo packages |
| `pnpm run build` | Type check and build all packages |
| `pnpm --filter @workspace/api-spec run codegen` | Re-generate React Query hooks and Zod schemas from `openapi.yaml` |
| `pnpm --filter @workspace/db run push` | Synchronize Drizzle schema with PostgreSQL |
| `pnpm --filter @workspace/db run seed:marketplace` | Insert demo listings and sample farm accounts |
