import { ProjectConfig } from "../types";

export const PROJECTS: ProjectConfig[] = [
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
    commands: ["npm run dev"],
  },
];
