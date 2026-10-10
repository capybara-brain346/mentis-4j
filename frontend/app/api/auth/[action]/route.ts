import { proxyAuthRequest } from "@/lib/auth-proxy";

async function handle(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  return proxyAuthRequest(request, action);
}

export const GET = handle;
export const POST = handle;
