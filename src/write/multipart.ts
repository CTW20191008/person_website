export type MultipartPart = {
  name: string;
  filename?: string;
  bytes: Buffer;
};

export function multipartBoundary(contentType: string): string | undefined {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = (match?.[1] ?? match?.[2])?.trim();
  return boundary ? boundary : undefined;
}

export function parseMultipart(body: Buffer, contentType: string): MultipartPart[] {
  const boundary = multipartBoundary(contentType);
  if (!boundary) return [];
  const delim = Buffer.from(`--${boundary}`);
  const parts: MultipartPart[] = [];
  let cursor = body.indexOf(delim);
  if (cursor < 0) return parts;
  cursor += delim.length;

  while (cursor < body.length) {
    if (body.subarray(cursor, cursor + 2).toString() === "--") break;
    if (body[cursor] === 13 && body[cursor + 1] === 10) cursor += 2;
    const next = body.indexOf(delim, cursor);
    if (next < 0) break;
    let chunk = body.subarray(cursor, next);
    if (chunk.length >= 2 && chunk[chunk.length - 2] === 13 && chunk[chunk.length - 1] === 10) {
      chunk = chunk.subarray(0, chunk.length - 2);
    }
    const headerEnd = chunk.indexOf("\r\n\r\n");
    if (headerEnd >= 0) {
      const header = chunk.subarray(0, headerEnd).toString("utf8");
      const name = /name="([^"]*)"/.exec(header)?.[1] ?? "";
      const filename = /filename="([^"]*)"/.exec(header)?.[1];
      parts.push({
        name,
        filename,
        bytes: chunk.subarray(headerEnd + 4),
      });
    }
    cursor = next + delim.length;
  }
  return parts;
}
