import { buildMicroTickDeltas, getMarketSnapshot } from "@/lib/market/service";
import type { StreamEventPayload } from "@/lib/market/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Close cleanly before Vercel's 60s serverless ceiling; EventSource auto-reconnects
const MAX_STREAM_DURATION_MS = 45_000;
const TICK_INTERVAL_MS = 2_400;

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let lastVersion = -1;
      const startedAt = Date.now();

      const enqueueSse = (payload: StreamEventPayload) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Tell browser EventSource to reconnect cleanly after 1.5s if stream rolls over
      try {
        controller.enqueue(encoder.encode("retry: 1500\n\n"));
      } catch {
        closed = true;
        return;
      }

      const pushCycle = async () => {
        if (closed) return;
        try {
          const snapshot = await getMarketSnapshot();
          if (snapshot.version !== lastVersion) {
            lastVersion = snapshot.version;
            enqueueSse({
              type: "snapshot",
              timestamp: Date.now(),
              snapshot,
            });
          } else {
            const deltas = buildMicroTickDeltas(snapshot);
            enqueueSse({
              type: "tick",
              timestamp: Date.now(),
              deltas,
              telemetry: snapshot.telemetry,
            });
          }
        } catch {
          enqueueSse({
            type: "heartbeat",
            timestamp: Date.now(),
          });
        }
      };

      // Send initial snapshot immediately
      await pushCycle();

      const interval = setInterval(async () => {
        if (closed || request.signal.aborted) {
          clearInterval(interval);
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // already closed
            }
          }
          return;
        }

        if (Date.now() - startedAt >= MAX_STREAM_DURATION_MS) {
          clearInterval(interval);
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
          return;
        }

        await pushCycle();
      }, TICK_INTERVAL_MS);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
