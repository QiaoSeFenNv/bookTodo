import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isValidAccessKey } from "../middleware/access-key.js";

const verifySchema = z.object({
  accessKey: z.string().min(1),
});

const maxFailedAttempts = 5;
let failedAttempts = 0;

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
        failedAttempts += 1;
        app.log.warn(
          { failedAttempts, maxFailedAttempts },
          "Invalid access key attempt",
        );

        if (failedAttempts >= maxFailedAttempts) {
          reply.raw.once("finish", () => {
            app.log.error("Maximum invalid access key attempts reached; stopping service");
            setImmediate(() => process.exit(78));
          });
        }

        return reply.code(401).send({ error: "unauthorized" });
      }

      failedAttempts = 0;
      return { ok: true };
    },
  );
}
