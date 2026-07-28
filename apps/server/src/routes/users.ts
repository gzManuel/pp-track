import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { upsertUserRequestSchema, userSchema } from "@repo/api-contract";

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    "/users/upsert",
    {
      onRequest: app.verifyInternalSecret,
      schema: { body: upsertUserRequestSchema, response: { 200: userSchema } },
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
