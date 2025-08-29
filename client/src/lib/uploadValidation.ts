import { z } from "zod";

const FileMode = z.object({
  mode: z.literal("file"),
  file: z.custom<File>((v) => v instanceof File && v.size > 0, "Choose a league file"),
});

const UrlMode = z.object({
  mode: z.literal("url"),
  url: z.string().url("Enter a valid http(s) URL"),
});

export const UploadSchema = z.discriminatedUnion("mode", [FileMode, UrlMode]);
export type UploadInput = z.infer<typeof UploadSchema>;