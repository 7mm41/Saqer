import type { FastifyInstance } from 'fastify';
import { requireAuthContext } from '../auth.ts';

/** `GET /v1/live`: the Server-Sent Events stream described in `lib/live.ts`. */
export async function liveRoutes(api: FastifyInstance) {
  api.get('/live', { preHandler: api.guard() }, async (request, reply) => {
    const { user, sessionId } = requireAuthContext(request);
    reply.hijack();
    const stream = reply.raw;
    stream.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx: don't buffer the stream
    });
    // Clients reconnect 3 s after a drop, then refresh everything once.
    stream.write('retry: 3000\n\nevent: ready\ndata: {}\n\n');
    const remove = api.live.add({ userId: user.id, sessionId, role: user.role, stream });
    request.raw.on('close', remove);
  });
}
