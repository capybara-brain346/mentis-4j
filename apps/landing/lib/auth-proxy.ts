const routes: Record<string, { method: string; path: string }> = {
  "sign-in": { method: "GET", path: "/api/sign-in" },
  callback: { method: "GET", path: "/api/google/callback" },
  account: { method: "GET", path: "/api/account" },
  connections: { method: "GET", path: "/api/connections" },
  disconnect: { method: "POST", path: "/api/connections/disconnect" },
  logout: { method: "POST", path: "/api/logout" },
};

function canonicalOrigin(value: string | undefined): string {
  const url = new URL(value ?? "");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("An HTTPS origin is required");
  return url.origin;
}

export function backendOrigin(): string {
  return canonicalOrigin(process.env.MENTIS_BACKEND_URL);
}

export async function proxyAuthRequest(
  request: Request,
  action: string,
): Promise<Response> {
  if (!Object.hasOwn(routes, action))
    return new Response(null, { status: 404 });
  const route = routes[action];
  if (request.method !== route.method) {
    return new Response(null, {
      status: 405,
      headers: { Allow: route.method },
    });
  }
  const incoming = new URL(request.url);
  try {
    const frontend = canonicalOrigin(process.env.FRONTEND_BASE_URL);
    if (route.method === "POST" && request.headers.get("Origin") !== frontend) {
      return new Response("Forbidden", { status: 403 });
    }
    const origin = backendOrigin();
    const target = new URL(route.path, origin);
    if (action === "callback") target.search = incoming.search;
    const headers = new Headers();
    // Forward only Mentis cookies, not other cookies on the frontend host.
    const cookies = (request.headers.get("Cookie") ?? "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter((cookie) => /^__Host-mentis-(session|sign-in)=/.test(cookie));
    if (cookies.length) headers.set("Cookie", cookies.join("; "));
    let body: string | undefined;
    if (route.method === "POST") {
      headers.set("Origin", origin);
      headers.set("Content-Type", "application/x-www-form-urlencoded");
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4096) {
            await reader.cancel();
            return new Response("Request too large", { status: 413 });
          }
          chunks.push(value);
        }
      }
      const decoder = new TextDecoder();
      body =
        chunks
          .map((chunk) => decoder.decode(chunk, { stream: true }))
          .join("") + decoder.decode();
    }
    const upstream = await fetch(target, {
      method: route.method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const responseHeaders = new Headers({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    for (const name of ["content-type", "location", "x-content-type-options"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie())
      responseHeaders.append("Set-Cookie", cookie);
    if (
      (action === "sign-in" || action === "callback") &&
      !upstream.headers.has("Location")
    ) {
      responseHeaders.set("Location", "/sign-in?error=unavailable");
      return new Response(null, { status: 302, headers: responseHeaders });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    if (action === "sign-in" || action === "callback") {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/sign-in?error=unavailable",
          "Cache-Control": "no-store",
        },
      });
    }
    return Response.json(
      { error: "Account service is unavailable. Try again." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
