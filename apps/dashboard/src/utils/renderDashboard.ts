interface ServiceStatus {
  name: string;
  status: "online" | "offline" | "unknown";
}

interface ProjectConfig {
  name: string;
  client?: { url: string; healthPath?: string };
  server?: { url: string; healthPath?: string };
  commands: string[];
}

const PROJECTS: ProjectConfig[] = [
  {
    name: "Questurian",
    client: { url: "http://localhost:4200" },
    server: { url: "http://localhost:3333", healthPath: "/health" },
    commands: ["nx serve questurian-client", "nx serve questurian-server"],
  },
  {
    name: "LocationManager",
    client: { url: "http://localhost:4201" },
    server: { url: "http://localhost:3334", healthPath: "/health" },
    commands: ["nx serve locationmanager-client", "nx serve locationmanager-server"],
  },
  {
    name: "YouTube Article Generator",
    client: { url: "http://localhost:4202" },
    server: { url: "http://localhost:3335", healthPath: "/health" },
    commands: ["nx serve youtube-article-generator-client", "nx serve youtube-article-generator-server"],
  },
  {
    name: "Questurian Leads",
    client: { url: "http://localhost:3004" },
    server: { url: "http://localhost:4004", healthPath: "/health" },
    commands: ["pnpm run dev"],
  },
];

async function checkHealth(url: string, healthPath: string = "/"): Promise<"online" | "offline"> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${url}${healthPath}`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok ? "online" : "offline";
  } catch {
    return "offline";
  }
}

function getStatusIcon(status: "online" | "offline" | "unknown"): string {
  switch (status) {
    case "online": return "🟢";
    case "offline": return "🔴";
    default: return "⏳";
  }
}

async function getProjectStatuses(): Promise<Map<string, { client: string; server: string }>> {
  const statuses = new Map<string, { client: string; server: string }>();

  await Promise.all(
    PROJECTS.map(async (project) => {
      const [clientStatus, serverStatus] = await Promise.all([
        project.client ? checkHealth(project.client.url, project.client.healthPath) : "unknown" as const,
        project.server ? checkHealth(project.server.url, project.server.healthPath) : "unknown" as const,
      ]);
      statuses.set(project.name, {
        client: getStatusIcon(clientStatus),
        server: getStatusIcon(serverStatus),
      });
    })
  );

  return statuses;
}

// Track if this is first render
let isFirstRender = true;

export async function renderDashboard(initialDelay: number = 0) {
  if (initialDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, initialDelay));
  }

  const statuses = await getProjectStatuses();

  let projectsDisplay = "";
  PROJECTS.forEach((project, index) => {
    const status = statuses.get(project.name) || { client: "⏳", server: "⏳" };
    projectsDisplay += `
  ${index + 1}.  ${project.name}
     ├── Client: ${status.client} ${project.client?.url || "N/A"}
     └── Server: ${status.server} ${project.server?.url || "N/A"}
     ├── Commands:
${project.commands.map(cmd => `     │   • ${cmd}`).join("\n")}
`;
  });

  const dashboard = `
╔══════════════════════════════════════════════════════════════╗
║                    QUESTURIAN DASHBOARD                      ║
╚══════════════════════════════════════════════════════════════╝

  Purpose: Internal monorepo control center
  Main Dev: Alan Malpartida
  System: NX Workspace / Multi-Project Orchestrator

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  PROJECTS:
${projectsDisplay}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Dashboard API: http://localhost:3000
  Last checked: ${new Date().toLocaleTimeString()}
`;

  // Check if running standalone (direct TTY) vs via Nx/Turbo (piped output)
  const isStandalone = process.stdout.isTTY && !process.env.TURBO_HASH;

  if (isStandalone) {
    // Running standalone - use ANSI clear for nice refresh
    process.stdout.write("\x1b[2J\x1b[H" + dashboard);
  } else if (isFirstRender) {
    // Running via Nx/Turbo - only print full dashboard once
    console.log(dashboard);
    isFirstRender = false;
  } else {
    // Subsequent refreshes via Nx - just print compact status
    const statusLine = PROJECTS.map((p, i) => {
      const s = statuses.get(p.name) || { client: "⏳", server: "⏳" };
      return `${i + 1}. ${p.name}: ${s.client}${s.server}`;
    }).join(" | ");
    console.log(`\n📊 Status @ ${new Date().toLocaleTimeString()}: ${statusLine}`);
  }
}

// Re-check every 30 seconds
export function startDashboardRefresh(intervalMs: number = 30000) {
  setInterval(() => renderDashboard(), intervalMs);
}
  
