import { ProjectConfig, GlobalCommand } from "../types";

export const PROJECTS: ProjectConfig[] = [
  {
    name: "Location Manager",
    description: "Media location management with AI-powered alt-text generation",
    path: "apps/location-manager",
    client: {
      url: "http://localhost:3002",
      port: 3002,
      type: "vite",
      description: "React + Vite frontend for location management UI",
    },
    server: {
      url: "http://localhost:4002",
      healthPath: "/health",
      port: 4002,
      type: "bun",
      description: "Bun + Hono API for locations, media, geocoding",
    },
    commands: {
      dev: {
        cmd: "cd apps/location-manager && pnpm run dev",
        description: "Start all LM services via Turbo (client, server, python)",
      },
      devClean: {
        cmd: "cd apps/location-manager && pnpm run dev:clean",
        description: "Kill ports, install deps, then start all services",
      },
      build: {
        cmd: "cd apps/location-manager && pnpm run build",
        description: "Build all packages for production",
      },
      lint: {
        cmd: "cd apps/location-manager && pnpm run lint",
        description: "Run ESLint on all packages",
      },
      test: {
        cmd: "cd apps/location-manager && pnpm run test",
        description: "Run tests across all packages",
      },
    },
  },
  {
    name: "LM Python Alt-Text",
    description: "AI image captioning service using BLIP model",
    path: "apps/location-manager/packages/python-alt-text",
    server: {
      url: "http://localhost:8642",
      healthPath: "/test",
      port: 8642,
      type: "python",
      description: "FastAPI + PyTorch for AI-powered image alt-text generation",
      slowStartup: true, // Needs time to load BLIP model
    },
    commands: {
      dev: {
        cmd: "cd apps/location-manager/packages/python-alt-text && pnpm run dev",
        description: "Start uvicorn server with hot reload on port 8642",
      },
      devClean: {
        cmd: "cd apps/location-manager/packages/python-alt-text && pnpm run dev:clean",
        description: "Kill port 8642, pip install requirements, start server",
      },
      "py:install": {
        cmd: "cd apps/location-manager/packages/python-alt-text && pnpm run py:install",
        description: "Install Python deps to user site-packages",
      },
      "py:install:system": {
        cmd: "cd apps/location-manager/packages/python-alt-text && pnpm run py:install:system",
        description: "Install Python deps system-wide (requires sudo)",
      },
    },
  },
  {
    name: "AI Blog Writer",
    description: "Converts video metadata to Markdown articles via 8-stage AI pipeline",
    path: "apps/ai-blog-writer",
    client: {
      url: "http://localhost:3003",
      port: 3003,
      type: "vite",
      description: "React + Vite frontend for article generation UI",
    },
    server: {
      url: "http://localhost:4003",
      healthPath: "/health",
      port: 4003,
      type: "python",
      description: "FastAPI backend with LangChain, LLaMA Index, Weaviate",
    },
    commands: {
      dev: {
        cmd: "cd apps/ai-blog-writer && pnpm run dev",
        description: "Start frontend (3003) and backend (4003) via Nx",
      },
      devClean: {
        cmd: "cd apps/ai-blog-writer && pnpm run dev:clean",
        description: "Kill ports 3003/4003, pnpm + pip install, start via Nx",
      },
      build: {
        cmd: "cd apps/ai-blog-writer && pnpm run build",
        description: "Build frontend and compile Python bytecode",
      },
      lint: {
        cmd: "cd apps/ai-blog-writer && pnpm run lint",
        description: "Run ESLint (frontend) and flake8 (backend)",
      },
      test: {
        cmd: "cd apps/ai-blog-writer && pnpm run test",
        description: "Run pytest on backend tests",
      },
      "dev:docker": {
        cmd: "cd apps/ai-blog-writer && pnpm run dev:docker",
        description: "Build and run with Docker Compose (includes Weaviate)",
      },
    },
  },
  {
    name: "Questurian Leads",
    description: "Multi-source lead aggregation (RSS, Instagram, Reddit, Telegram)",
    path: "apps/questurian-leads",
    client: {
      url: "http://localhost:3004",
      port: 3004,
      type: "vite",
      description: "React + Vite frontend for lead management and content approval",
    },
    server: {
      url: "http://localhost:4004",
      healthPath: "/health",
      port: 4004,
      type: "python",
      description: "FastAPI backend with feedparser, scrapy, playwright",
    },
    commands: {
      dev: {
        cmd: "cd apps/questurian-leads/apps/api && pnpm run dev",
        description: "Start API server with uvicorn on port 4004",
      },
      devClean: {
        cmd: "cd apps/questurian-leads/apps/api && pnpm run dev:clean",
        description: "Kill port 4004, pip install in venv, start server",
      },
      "client:dev": {
        cmd: "cd apps/questurian-leads/apps/client && pnpm run dev",
        description: "Start Vite dev server on port 5173",
      },
      "client:devClean": {
        cmd: "cd apps/questurian-leads/apps/client && pnpm run dev:clean",
        description: "Kill port 5173, install deps, start Vite",
      },
      "docker:start": {
        cmd: "cd apps/questurian-leads && docker compose up -d libretranslate",
        description: "Start LibreTranslate container on port 5001",
      },
      "docker:stop": {
        cmd: "cd apps/questurian-leads && docker compose stop libretranslate",
        description: "Stop LibreTranslate container",
      },
    },
  },
  {
    name: "Dashboard",
    description: "CLI dashboard for monitoring all Questurian services",
    path: "apps/dashboard",
    server: {
      url: "http://localhost:4500",
      healthPath: "/health",
      port: 4500,
      type: "bun",
      description: "Bun + Hono + Ink terminal UI dashboard",
    },
    commands: {
      dev: {
        cmd: "cd apps/dashboard && pnpm run dev",
        description: "Start dashboard with hot reload",
      },
      devClean: {
        cmd: "cd apps/dashboard && pnpm run dev:clean",
        description: "Install deps and start dashboard",
      },
      build: {
        cmd: "cd apps/dashboard && pnpm run build",
        description: "Bundle dashboard for production",
      },
    },
  },
  {
    name: "Questura",
    description: "Full-stack SaaS starter with Stripe subscriptions and auth",
    path: "apps/questura",
    client: {
      url: "http://localhost:3000",
      port: 3000,
      type: "next",
      description: "Next.js 15 frontend with React Query and Zustand",
    },
    server: {
      url: "http://localhost:4000",
      healthPath: "/api/health",
      port: 4000,
      type: "payload",
      description: "Payload CMS backend with Stripe integration",
    },
    commands: {
      dev: {
        cmd: "pnpm run questura",
        description: "Start client (3000) and server (4000) via Turbo",
      },
      devClean: {
        cmd: "pnpm install --filter @questura/client... --filter @questura/server... && pnpm run questura",
        description: "Install deps and start client + server",
      },
      build: {
        cmd: "pnpm turbo run build --filter=@questura/client --filter=@questura/server",
        description: "Build Questura client and server for production",
      },
      lint: {
        cmd: "pnpm turbo run lint --filter=@questura/client --filter=@questura/server",
        description: "Run lint for Questura packages",
      },
      test: {
        cmd: "pnpm turbo run test --filter=@questura/client --filter=@questura/server",
        description: "Run tests for Questura packages",
      },
    },
  },
];

// Global monorepo commands
export const GLOBAL_COMMANDS: GlobalCommand[] = [
  // Turbo commands
  {
    cmd: "turbo run dev",
    description: "Start all services in the monorepo",
    category: "turbo",
  },
  {
    cmd: "turbo run dev:clean",
    description: "Clean start all services (kill ports, install deps, run)",
    category: "turbo",
  },
  {
    cmd: "turbo run build",
    description: "Build all packages for production",
    category: "turbo",
  },
  {
    cmd: "turbo run lint",
    description: "Lint all packages",
    category: "turbo",
  },
  {
    cmd: "turbo run test",
    description: "Run tests in all packages",
    category: "turbo",
  },
  {
    cmd: "turbo run dev --filter=@questurian/lm-server",
    description: "Run dev for a specific package only",
    category: "turbo",
  },
  // Utility commands
  {
    cmd: "lsof -ti:PORT | xargs kill -9",
    description: "Kill process on a specific port (replace PORT)",
    category: "utility",
  },
  {
    cmd: "lsof -i :3000-9000 | grep LISTEN",
    description: "List all processes listening on ports 3000-9000",
    category: "utility",
  },
  // Docker commands
  {
    cmd: "docker ps",
    description: "List running containers",
    category: "docker",
  },
  {
    cmd: "docker compose up -d",
    description: "Start all containers in detached mode",
    category: "docker",
  },
  {
    cmd: "docker compose down",
    description: "Stop and remove all containers",
    category: "docker",
  },
];

// Quick reference exports
export const DEV_CLEAN_COMMANDS = PROJECTS.map((p) => ({
  name: p.name,
  command: p.commands.devClean.cmd,
  description: p.commands.devClean.description,
  ports: [p.client?.port, p.server?.port].filter(Boolean) as number[],
}));

export const ALL_PORTS = PROJECTS.flatMap((p) => [
  p.client ? { name: `${p.name} Client`, port: p.client.port, type: p.client.type } : null,
  p.server ? { name: `${p.name} Server`, port: p.server.port, type: p.server.type } : null,
]).filter(Boolean) as { name: string; port: number; type: string }[];
