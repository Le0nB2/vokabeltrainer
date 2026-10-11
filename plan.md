# Deployment Plan: Docker & Render + Neon (Postgres) Dual Support

This application is designed to be easily deployed in two distinct environments:
1. **Docker (Locally or self-hosted)** using SQLite.
2. **Render (Cloud Platform)** using Neon (Serverless Postgres).

## 1. Docker Deployment (Current Status)

The Docker deployment is already implemented and fully functional. It uses the `Dockerfile` and `docker-compose.yml` to spin up the application with a local SQLite database attached via a persistent volume. No changes are required to use this deployment mode.

To run locally using Docker:
```bash
docker-compose up -d
```

## 2. Render Deployment (with Neon Postgres)

To enable deployment on Render with a Neon PostgreSQL database without modifying the existing SQLite-based Docker setup or creating complex branching logic, we use an on-the-fly configuration switch during the Render build process.

### Step 1: Create a Render Build Script

We have introduced a custom build script at `scripts/render-build.sh`. This script will:
- Modify `prisma/schema.prisma` using `sed` to switch the database provider from `"sqlite"` to `"postgresql"` and the URL to use the `DATABASE_URL` environment variable.
- Install node dependencies (`npm ci`).
- Generate the Prisma Client tailored for PostgreSQL.
- Push the database schema directly to Neon (`npx prisma db push --accept-data-loss`) because our current migration files are SQLite-specific.
- Build the Next.js application (`npm run build`).

### Step 2: Configure Render (`render.yaml`)

The repository already contains a `render.yaml` Blueprint file which specifies the deployment configuration for Render. It has been verified to use our new custom script.
- **buildCommand**: `./scripts/render-build.sh`
- **startCommand**: `npm start`
- It expects several environment variables (notably `DATABASE_URL` pointing to your Neon database).

### Step 3: Deployment Instructions

1. Set up a free PostgreSQL database on [Neon](https://neon.tech/) and copy the connection string.
2. Go to your [Render Dashboard](https://dashboard.render.com/).
3. Create a new "Blueprint" and connect your repository.
4. Render will read `render.yaml` and set up the web service.
5. In the Render dashboard for the new service, navigate to the **Environment** tab and add the necessary environment variables, crucially `DATABASE_URL` with your Neon connection string.
6. Trigger a deploy. Render will execute `scripts/render-build.sh`, configuring Prisma for PostgreSQL just for this environment, applying the schema, and building the app.

This approach ensures the default development and Docker environments remain unaffected while securely and reliably deploying to Render using PostgreSQL.
