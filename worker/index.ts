/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const isLocal =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1";

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    const securedResponse = new Response(response.body, response);

    securedResponse.headers.set("X-Content-Type-Options", "nosniff");
    securedResponse.headers.set("Referrer-Policy", "no-referrer");
    securedResponse.headers.set("X-Frame-Options", "DENY");
    securedResponse.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    securedResponse.headers.set(
      "Cross-Origin-Resource-Policy",
      url.pathname === "/revaloop-bridge.js" ? "cross-origin" : "same-origin",
    );
    securedResponse.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );
    securedResponse.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline'",
        `connect-src 'self'${
          isLocal ? " ws://localhost:* ws://127.0.0.1:*" : ""
        }`,
        `frame-src https:${
          isLocal ? " http://localhost:* http://127.0.0.1:*" : ""
        }`,
      ].join("; "),
    );

    if (
      url.pathname.startsWith("/review/") ||
      url.pathname.startsWith("/dashboard") ||
      url.pathname.startsWith("/join") ||
      url.pathname.startsWith("/login") ||
      url.pathname.startsWith("/register") ||
      url.pathname.startsWith("/logout") ||
      url.pathname.startsWith("/api/")
    ) {
      securedResponse.headers.set(
        "Cache-Control",
        "private, no-store, max-age=0",
      );
      securedResponse.headers.set("Pragma", "no-cache");
    }

    if (
      url.pathname.startsWith("/review/") ||
      url.pathname.startsWith("/dashboard") ||
      url.pathname.startsWith("/join") ||
      url.pathname.startsWith("/login") ||
      url.pathname.startsWith("/register") ||
      url.pathname.startsWith("/logout")
    ) {
      securedResponse.headers.set(
        "X-Robots-Tag",
        "noindex, nofollow, noarchive, nosnippet",
      );
    }

    if (url.protocol === "https:") {
      securedResponse.headers.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }

    return securedResponse;
  },
};

export default worker;
