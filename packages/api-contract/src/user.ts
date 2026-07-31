import { z } from "zod";

/**
 * `POST /api/users/upsert` — called by the web app's NextAuth sign-in callback,
 * not by the browser. It is still part of the contract: the callback consumes
 * the response to seed the session's user id.
 */
export const upsertUserRequestSchema = z.object({
  email: z.email(),
  name: z.string().max(200).optional(),
  image: z.url().optional(),
});

export type UpsertUserRequest = z.infer<typeof upsertUserRequestSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

export type User = z.infer<typeof userSchema>;
