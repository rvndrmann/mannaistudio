// `server-only` exists to fail the Next build if a server module is pulled into
// a client bundle. Under vitest everything runs in node, and its client entry
// throws on import — so the guard is stubbed out for tests only. The real
// package still protects the build.
export {}
