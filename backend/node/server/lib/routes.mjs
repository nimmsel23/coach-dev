import { createRoute, z } from "@hono/zod-openapi";

export const anyJsonSchema = z.any();
export const looseObjectSchema = z.object({}).loose();
const jsonContent = (schema = anyJsonSchema) => ({ "application/json": { schema } });
export const jsonResponse = (schema = anyJsonSchema, description = "OK") => ({
  description,
  content: jsonContent(schema),
});

export function defineJsonRoute({ method, path, tags, summary, description, query, params, jsonBody, responseSchema = anyJsonSchema, responseDescription = "OK", responses }) {
  const request = {};
  if (query) request.query = query;
  if (params) request.params = params;
  if (jsonBody) request.body = { content: jsonContent(jsonBody) };
  return createRoute({
    method,
    path,
    tags,
    summary,
    description,
    ...(Object.keys(request).length ? { request } : {}),
    responses: responses || { 200: jsonResponse(responseSchema, responseDescription) },
  });
}
