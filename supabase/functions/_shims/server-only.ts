// `server-only` exists to fail a Next.js build that pulls a server module into
// a client bundle. There is no client bundle here — the whole function is the
// server — so the correct reading of it in Deno is nothing at all.
export {}
