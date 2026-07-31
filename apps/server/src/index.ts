import { buildApp } from "./app.js";
import { env } from "./env.js";

const app = await buildApp();

// Graceful shutdown on both Ctrl-C (SIGINT) and supervisor stops (SIGTERM —
// what Docker/systemd/pm2 send). app.close() fires the onClose hook that
// disconnects Prisma.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().finally(() => {
      process.exit();
    });
  });
}

await app.listen({ port: env.PORT, host: env.HOST });
