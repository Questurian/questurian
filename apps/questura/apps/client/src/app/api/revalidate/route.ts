import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RevalidationRequest = {
  tags?: unknown;
  paths?: unknown;
};

function configuredSecret(): string | null {
  return process.env.QUESTURA_REVALIDATION_SECRET || process.env.REVALIDATION_SECRET || null;
}

function requestSecret(req: NextRequest): string | null {
  const explicit = req.headers.get("x-revalidation-secret");
  if (explicit) return explicit;

  const authorization = req.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  return null;
}

function parseStringList(value: unknown, label: string): string[] {
  if (typeof value === "undefined") return [];
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  const values = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  if (values.length > 100) {
    throw new Error(`${label} may contain at most 100 entries`);
  }

  return Array.from(new Set(values));
}

function parsePaths(value: unknown): string[] {
  const paths = parseStringList(value, "paths");
  const invalid = paths.find((path) => !path.startsWith("/"));
  if (invalid) {
    throw new Error(`path must start with "/": ${invalid}`);
  }

  return paths;
}

export async function POST(req: NextRequest) {
  const secret = configuredSecret();
  if (!secret) {
    return NextResponse.json({ error: "Revalidation secret is not configured" }, { status: 500 });
  }

  if (requestSecret(req) !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: RevalidationRequest;
  try {
    payload = (await req.json()) as RevalidationRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let tags: string[];
  let paths: string[];
  try {
    tags = parseStringList(payload.tags, "tags");
    paths = parsePaths(payload.paths);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid revalidation payload" },
      { status: 400 },
    );
  }

  if (tags.length === 0 && paths.length === 0) {
    return NextResponse.json({ error: "At least one tag or path is required" }, { status: 400 });
  }

  for (const tag of tags) {
    revalidateTag(tag);
  }

  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json({
    revalidated: true,
    tags,
    paths,
  });
}
