import type { FastifyPluginAsync } from "fastify";
import prisma from "../prisma";

const usersRoutes: FastifyPluginAsync = async (app) => {
  app.post<{
    Body: { email: string; name?: string; image?: string };
  }>("/users/upsert", { preHandler: app.verifyInternalSecret }, async (request) => {
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
