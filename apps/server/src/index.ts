import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { env, paths } from "./config.js";
import { ensureSchema, pingDb } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { dayNotesRoutes } from "./routes/day-notes.js";
import { dayIndexRoutes } from "./routes/days.js";
import { prefsRoutes } from "./routes/prefs.js";
import { todoRoutes } from "./routes/todos.js";

async function buildServer() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: env.NODE_ENV === "production" ? false : env.WEB_ORIGIN,
    allowedHeaders: ["Content-Type", "X-Access-Key", "Authorization"],
  });

  app.get("/api/health", async (_request, reply) => {
    try {
      const dbOk = await pingDb();
      return {
        ok: true,
        db: dbOk,
        env: env.NODE_ENV,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "db_unavailable";
      return reply.code(503).send({
        ok: false,
        db: false,
        env: env.NODE_ENV,
        error: message,
      });
    }
  });

  await app.register(authRoutes);
  await app.register(todoRoutes);
  await app.register(prefsRoutes);
  await app.register(dayNotesRoutes);
  await app.register(dayIndexRoutes);

  const webDistExists = fs.existsSync(path.join(paths.webDist, "index.html"));
  if (webDistExists) {
    await app.register(fastifyStatic, {
      root: paths.webDist,
      prefix: "/",
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "not_found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

async function main() {
  await ensureSchema();
  const app = await buildServer();

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info(`Book Todo server listening on http://0.0.0.0:${env.PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

main();
