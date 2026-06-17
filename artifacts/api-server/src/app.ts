import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
// Capture the raw request body during JSON parsing so signature-verified
// webhooks (e.g. Typeform) can validate the HMAC over the exact bytes sent,
// not the re-serialized parsed object.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

// Resolve the publishable key from the incoming request host so the same
// server can serve multiple Clerk custom domains. Falls back to
// CLERK_PUBLISHABLE_KEY when the host doesn't map to a custom domain.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// --- Static frontend SPAs --------------------------------------------------
// The four SPAs are built (see railway.json buildCommand) into their own dist
// folders and served by this single server, replacing Replit's reverse proxy.
// Paths are resolved from the working directory (the repo root, /app on
// Railway). Sub-path apps are registered before the root app so they win, and
// each app gets an SPA fallback so client-side (wouter) deep links resolve to
// its index.html.
const repoRoot = process.cwd();
const spaDir = (name: string, out: string): string =>
  path.join(repoRoot, "artifacts", name, out);

function mountSpa(basePath: string, dir: string): void {
  const indexHtml = path.join(dir, "index.html");
  app.use(basePath, express.static(dir));
  app.use(basePath, (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    res.sendFile(indexHtml, (err) => {
      if (err) next();
    });
  });
}

mountSpa("/marketing-os", spaDir("marketing-os", "dist/public"));
mountSpa("/pitch-deck", spaDir("pitch-deck", "dist/public"));
mountSpa("/__mockup", spaDir("mockup-sandbox", "dist"));

// Root app (personal-brand) is registered last so it doesn't shadow the
// sub-path apps. Its fallback skips /api so unmatched API routes still 404.
const rootDir = spaDir("personal-brand", "dist/public");
const rootIndex = path.join(rootDir, "index.html");
app.use(express.static(rootDir));
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path === "/api" || req.path.startsWith("/api/")) return next();
  res.sendFile(rootIndex, (err) => {
    if (err) next();
  });
});

export default app;
