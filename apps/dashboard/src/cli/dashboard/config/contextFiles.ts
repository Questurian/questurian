import fs from "node:fs";
import path from "node:path";

export interface ContextFile {
  label: string;
  relativePath: string;
  absolutePath: string;
}

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (
      fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(dir, ".git"))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

const RELATIVE_PATHS = [
  "CONTEXT.md",
  "apps/ai-blog-writer/CONTEXT.md",
  "apps/ai-blog-writer/apps/backend/CONTEXT.md",
  "apps/ai-blog-writer/apps/converter/CONTEXT.md",
  "apps/ai-blog-writer/apps/frontend/CONTEXT.md",
  "apps/ai-blog-writer/packages/shared/CONTEXT.md",
  "apps/ai-blog-writer/packages/utils/CONTEXT.md",
  "apps/dashboard/CONTEXT.md",
  "apps/location-manager/CONTEXT.md",
  "apps/location-manager/packages/client/CONTEXT.md",
  "apps/location-manager/packages/python-alt-text/CONTEXT.md",
  "apps/location-manager/packages/server/CONTEXT.md",
  "apps/location-manager/packages/shared/CONTEXT.md",
  "apps/questura/CONTEXT.md",
  "apps/questura/apps/client/CONTEXT.md",
  "apps/questura/apps/server/CONTEXT.md",
];

function labelFor(relativePath: string): string {
  if (relativePath === "CONTEXT.md") return "(root)";
  return relativePath.replace(/\/CONTEXT\.md$/, "");
}

export const REPO_ROOT = findRepoRoot(process.cwd());

export const CONTEXT_FILES: ContextFile[] = RELATIVE_PATHS.map((rel) => ({
  label: labelFor(rel),
  relativePath: rel,
  absolutePath: path.join(REPO_ROOT, rel),
}));
