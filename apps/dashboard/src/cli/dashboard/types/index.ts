export interface ServiceConfig {
  url: string;
  healthPath?: string;
  port: number;
  type: "python" | "bun" | "node" | "vite" | "next" | "payload";
  description: string;
  /** If true, show "starting" instead of "offline" for initial grace period (default 60s) */
  slowStartup?: boolean;
  /** Custom grace period in ms for slow startup services (default: 60000) */
  startupGracePeriodMs?: number;
}

export interface CommandInfo {
  cmd: string;
  description: string;
}

export interface ProjectCommands {
  dev: CommandInfo;
  devClean: CommandInfo;
  build?: CommandInfo;
  lint?: CommandInfo;
  test?: CommandInfo;
  [key: string]: CommandInfo | undefined; // Allow custom commands
}

export interface ProjectConfig {
  name: string;
  description: string;
  path: string;
  client?: ServiceConfig;
  server?: ServiceConfig;
  commands: ProjectCommands;
}

export type ServiceStatus = "online" | "offline" | "checking" | "starting";

export interface ProjectStatus {
  client: ServiceStatus;
  server: ServiceStatus;
}

// Global commands that apply to the whole monorepo
export interface GlobalCommand {
  cmd: string;
  description: string;
  category: "turbo" | "docker" | "utility";
}
