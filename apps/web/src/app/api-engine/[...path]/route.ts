import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function upstreamBase(): string {
  return (process.env.API_INTERNAL_URL || "http://127.0.0.1:8000").replace(
    /\/$/,
    "",
  );
}

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

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  const res = await fetch(target, init);

  const out = new Headers();
  const outCt = res.headers.get("content-type");
  if (outCt) {
    out.set("content-type", outCt);
  }
  const contentDisposition = res.headers.get("content-disposition");
  if (contentDisposition) {
    out.set("content-disposition", contentDisposition);
  }
  const contentLength = res.headers.get("content-length");
  if (contentLength) {
    out.set("content-length", contentLength);
  }

  return new NextResponse(await res.arrayBuffer(), {
    status: res.status,
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
