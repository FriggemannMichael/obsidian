import type { FastifyReply, FastifyRequest } from 'fastify';

export const requireAdmin =
    (token: string) => async (request: FastifyRequest, reply: FastifyReply) => {
        const header = request.headers.authorization;
        if (header !== `Bearer ${token}`) {
            return reply
                .status(401)
                .send({ code: 'UNAUTHORIZED', message: 'Admin-Token fehlt oder ist ungültig.' });
        }
    };
