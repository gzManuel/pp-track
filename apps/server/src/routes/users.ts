import type { FastifyPluginAsync } from "fastify";
import prisma from "../prisma.js";

const usersRoutes: FastifyPluginAsync = async (app) => {
  app.post<{
    Body: { email: string; name?: string; image?: string };
  }>("/users/upsert", async (request, reply) => {
    const secret = request.headers["x-internal-secret"];
    if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const { email, name, image } = request.body;

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: name ?? "",
        image,
      },
      update: {
        ...(name && { name }),
        ...(image && { image }),
      },
      select: { id: true, email: true, name: true, image: true },
    });

    return user;
  });
};

export default usersRoutes;
