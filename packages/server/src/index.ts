import Fastify from 'fastify';

const server = Fastify({ logger: true });
server.get('/health', async () => ({ ok: true }));

const port = Number(process.env['PORT'] ?? 3000);
await server.listen({ host: '0.0.0.0', port });

