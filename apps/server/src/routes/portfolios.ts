import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createPortfolioRequestSchema, errorResponseSchema, holdingSchema, portfolioSchema } from "@repo/api-contract";
import { requirePortfolio } from "../services/authorization.js";

const portfolioParams = z.object({ id: z.uuid() });

/**
 * Portfolio routes: the collection itself, plus its holdings sub-resource.
 * Transactions live in `transactions.ts` — they share the `/portfolios/:id`
 * prefix but almost none of the logic.
 */
const portfoliosRoutes: FastifyPluginAsync = async (fastify) => {
  // Opt this plugin's routes into Zod-typed request/reply inference.
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // #2 — `app.authenticate` runs first and sets `request.userId`.
  // #3 — `app.prisma` is the decorated shared client (no direct import).
  app.get("/portfolios", { onRequest: app.authenticate, schema: { response: { 200: z.array(portfolioSchema) } } }, async (request) =>
    app.prisma.portfolio.findMany({
      where: { userId: request.userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
  );

  app.post(
    "/portfolios",
    {
      onRequest: app.authenticate,
      schema: { body: createPortfolioRequestSchema, response: { 201: portfolioSchema } },
    },
    async (request, reply) => {
      const { name } = request.body; // typed as string, already validated

      // count + create must be atomic or two concurrent "first portfolio"
      // requests both become the default. Serializable isolation makes one of
      // them abort (P2034); retry it — the rerun sees the winner's row.
      const createWithDefaultFlag = () =>
        app.prisma.$transaction(
          async (tx) => {
            const existingCount = await tx.portfolio.count({
              where: { userId: request.userId },
            });
            return tx.portfolio.create({
              data: { userId: request.userId, name, isDefault: existingCount === 0 },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

      let portfolio;
      try {
        portfolio = await createWithDefaultFlag();
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
          throw error;
        }
        portfolio = await createWithDefaultFlag();
      }
      return reply.status(201).send(portfolio);
    },
  );

  app.get(
    "/portfolios/:id/holdings",
    {
      onRequest: app.authenticate,
      schema: { params: portfolioParams, response: { 200: z.array(holdingSchema), 404: errorResponseSchema } },
    },
    async (request) => {
      await requirePortfolio(app.prisma, request.params.id, request.userId);

      return app.prisma.holding.findMany({
        where: { portfolioId: request.params.id },
        include: {
          asset: {
            select: {
              ticker: true,
              name: true,
              currency: true,
              assetType: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });
    },
  );
};

export default portfoliosRoutes;
