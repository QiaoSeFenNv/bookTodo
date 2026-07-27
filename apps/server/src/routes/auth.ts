import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isValidAccessKey } from "../middleware/access-key.js";

const verifySchema = z.object({
  accessKey: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/auth/verify",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parsed = verifySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_request" });
      }

      if (!isValidAccessKey(parsed.data.accessKey)) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      return { ok: true };
    },
  );
}
