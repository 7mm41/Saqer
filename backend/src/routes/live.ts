import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireAuthContext } from '../auth.ts';

/** Opens an event stream on the raw response. */
function openStream(reply: FastifyReply) {
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
  return stream;
}

/** `GET /v1/live`: the Server-Sent Events stream described in `lib/live.ts`. */
export async function liveRoutes(api: FastifyInstance) {
  api.get('/live', { preHandler: api.guard() }, async (request, reply) => {
    const { user, sessionId } = requireAuthContext(request);
    const remove = api.live.add({ userId: user.id, sessionId, role: user.role, stream: openStream(reply) });
    request.raw.on('close', remove);
  });

  /**
   * `GET /v1/live/public`: the same stream without an account, carrying only
   * public changes (seasonal look, plans, catalogue). The app's welcome and
   * sign-in screens and the website use it.
   */
  api.get('/live/public', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const remove = api.live.add({ userId: null, sessionId: null, role: 'guest', stream: openStream(reply) });
    request.raw.on('close', remove);
  });
}
