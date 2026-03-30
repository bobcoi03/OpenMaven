/**
 * Streaming proxy for the simulation query agent.
 *
 * Next.js rewrites buffer SSE responses, breaking token-by-token streaming.
 * This route handler properly forwards the SSE stream unbuffered.
 */

export async function POST(request: Request) {
  const body = await request.text();

  const upstream = await fetch("http://localhost:8000/api/sim-query/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(await upstream.text(), { status: upstream.status });
  }

  // Forward the SSE stream directly — no buffering
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
