import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Sends JSON with an ETag, answering 304 when the client already has it.
 * Apps re-check on every foreground and live event, so unchanged data costs
 * one query and an empty response.
 */
export function sendCached(request: FastifyRequest, reply: FastifyReply, payload: unknown) {
  const body = JSON.stringify(payload);
  const etag = `W/"${createHash('sha1').update(body).digest('base64url')}"`;
  reply.header('ETag', etag).header('Cache-Control', 'private, no-cache');
  if (request.headers['if-none-match'] === etag) return reply.status(304).send();
  return reply.type('application/json; charset=utf-8').send(body);
}
