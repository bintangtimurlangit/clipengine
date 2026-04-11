import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function upstreamBase(): string {
  return (process.env.API_INTERNAL_URL || "http://127.0.0.1:8000").replace(
    /\/$/,
    "",
  );
}

/** Request headers needed for media (Range) and optional session auth. */
const FORWARD_REQUEST_HEADERS = [
  "range",
  "if-range",
  "if-match",
  "if-none-match",
  "if-modified-since",
  "authorization",
  "cookie",
] as const;

/** Response headers needed for streaming video (206, Content-Range, etc.). */
const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "cache-control",
] as const;

async function proxy(
  req: NextRequest,
  pathSegments: string[],
): Promise<NextResponse> {
  const path = pathSegments.join("/");
  const target = `${upstreamBase()}/${path}${req.nextUrl.search}`;

  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) {
    headers.set("content-type", ct);
  }
  const accept = req.headers.get("accept");
  if (accept) {
    headers.set("accept", accept);
  }
  for (const name of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(name);
    if (v) {
      headers.set(name, v);
    }
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let res: Response;
  try {
    res = await fetch(target, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        detail: `Cannot reach the API at ${upstreamBase()} (${msg}). Start the API (e.g. uvicorn on port 8000) or set API_INTERNAL_URL.`,
      },
      { status: 502 },
    );
  }

  const out = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const v = res.headers.get(name);
    if (v) {
      out.set(name, v);
    }
  }

  // Stream the body so large files and range responses are not buffered in memory.
  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: out,
  });
}

type RouteCtx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path ?? []);
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path ?? []);
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path ?? []);
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path ?? []);
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path ?? []);
}

export async function HEAD(req: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return proxy(req, path ?? []);
}
