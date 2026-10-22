import type { FastifyRequest } from "fastify";
import type { ZodType } from "zod";
import { idParam } from "../validation.js";

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export const idOf = (req: FastifyRequest) => parse(idParam, req.params).id;
