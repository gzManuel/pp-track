import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const upsertUserBody = z.object({
  email: z.email(),
  name: z.string().max(200).optional(),
  image: z.url().optional(),
});

const userResponse = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    "/users/upsert",
    {
      preHandler: app.verifyInternalSecret,
      schema: { body: upsertUserBody, response: { 200: userResponse } },
    },
    async (request) => {
      const { email, name, image } = request.body;

      return app.prisma.user.upsert({
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
    },
  );
};

export default usersRoutes;
