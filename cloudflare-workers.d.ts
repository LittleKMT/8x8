declare module "cloudflare:workers" {
  // The game is fully client-side. This declaration keeps the unused starter
  // database helper type-safe enough for Next.js static-export type checking.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const env: { DB?: any };
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;
