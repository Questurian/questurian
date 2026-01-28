import { exec } from "child_process";

/**
 * Check if a port is in use (process listening on it)
 * Uses lsof which is reliable on macOS/Linux
 */
export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    exec(`lsof -i :${port} -sTCP:LISTEN`, (error, stdout) => {
      // If lsof finds a process, stdout will have content
      resolve(!error && stdout.trim().length > 0);
    });
  });
}
