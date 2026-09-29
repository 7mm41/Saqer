import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAuthContext } from '../auth.ts';
import { errors } from '../lib/errors.ts';

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

/** Open streams per address: a phone or browser needs one or two, so many more is someone flooding the server. */
const MAX_STREAMS_PER_ADDRESS = 20;

/** `GET /v1/live`: the Server-Sent Events stream described in `lib/live.ts`. */
export async function liveRoutes(api: FastifyInstance) {
  const open = new Map<string, number>();
  /** Counts a stream for the request's address; false when it has too many already. */
  const admit = (request: FastifyRequest) => {
    const count = open.get(request.ip) ?? 0;
    if (count >= MAX_STREAMS_PER_ADDRESS) return false;
    open.set(request.ip, count + 1);
    request.raw.on('close', () => {
      const left = (open.get(request.ip) ?? 1) - 1;
      if (left > 0) open.set(request.ip, left); else open.delete(request.ip);
    });
    return true;
  };

  api.get('/live', { preHandler: api.guard() }, async (request, reply) => {
    const { user, sessionId, panel } = requireAuthContext(request);
    if (!admit(request)) throw errors.tooManyRequests();
    // Control panel updates reach only the owner's control panel sign-ins.
    const remove = api.live.add({ userId: user.id, sessionId, role: panel ? user.role : 'member', stream: openStream(reply) });
    request.raw.on('close', remove);
  });

  /**
   * `GET /v1/live/public`: the same stream without an account, carrying only
   * public changes (seasonal look, plans, catalogue). The app's welcome and
   * sign-in screens and the website use it.
   */
  api.get('/live/public', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!admit(request)) throw errors.tooManyRequests();
    const remove = api.live.add({ userId: null, sessionId: null, role: 'guest', stream: openStream(reply) });
    request.raw.on('close', remove);
  });
}
