import { HEALTH_CHECK_TIMEOUT } from "../config";

export async function checkHealth(
  url: string,
  healthPath: string = "/"
): Promise<"online" | "offline"> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
    const response = await fetch(`${url}${healthPath}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok ? "online" : "offline";
  } catch {
    return "offline";
  }
}
