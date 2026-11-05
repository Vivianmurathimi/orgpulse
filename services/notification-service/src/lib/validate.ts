import { z } from "zod";
import { HttpError } from "../middleware/errorHandler";

// Checks data against a zod schema. Bad data becomes a 400 with a clear message.
export function validate<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join(".");
    throw new HttpError(400, field ? `${field}: ${issue.message}` : issue.message);
  }
  return result.data;
}

// A real calendar date in the form YYYY-MM-DD
export const dateSchema = z.iso.date({ error: "must be a date in the form YYYY-MM-DD" });
