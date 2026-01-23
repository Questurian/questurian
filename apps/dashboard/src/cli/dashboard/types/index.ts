export interface ProjectConfig {
  name: string;
  client?: { url: string; healthPath?: string };
  server?: { url: string; healthPath?: string };
  commands: string[];
}

export interface ProjectStatus {
  client: "online" | "offline" | "checking";
  server: "online" | "offline" | "checking";
}
