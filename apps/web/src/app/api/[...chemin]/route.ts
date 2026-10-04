import type { NextRequest } from 'next/server';

/**
 * Relais vers l'API sur la même origine (/api/*), configuré à l'exécution par API_INTERNAL_URL.
 * En production, Caddy route /api directement vers l'API ; ce relais sert au développement,
 * aux tests et aux installations sans Caddy. Le cookie de session reste de première partie.
 */
const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
];

async function relay(request: NextRequest): Promise<Response> {
  const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, apiUrl);
  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP) headers.delete(header);
  headers.set('x-forwarded-host', request.nextUrl.host);
  headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''));

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    redirect: 'manual',
    ...(hasBody ? { body: await request.arrayBuffer() } : {}),
  });
  const responseHeaders = new Headers(upstream.headers);
  for (const header of ['content-encoding', 'content-length', 'transfer-encoding']) {
    responseHeaders.delete(header);
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const GET = relay;
export const POST = relay;
export const PUT = relay;
export const PATCH = relay;
export const DELETE = relay;
