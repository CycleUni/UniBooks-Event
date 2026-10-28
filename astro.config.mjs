import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

// Local development settings from .env (see .env.example).
const devEnv = loadEnv('development', process.cwd(), '');

function workersAssetsIntegration() {
  return {
    name: 'workers-static-assets',
    hooks: {
      'astro:build:done': async (args) => {
        if (args?.dir) {
          const clientDir = fileURLToPath(args.dir);
          const rootDistDir = path.resolve(clientDir, '..');
          const ignoreContent = '_worker.js\n_routes.json\n';
          fs.writeFileSync(path.join(clientDir, '.assetsignore'), ignoreContent);
          fs.writeFileSync(path.join(rootDistDir, '.assetsignore'), ignoreContent);
        }
      },
    },
  };
}

/**
 * Local development mirrors production, where this Worker and the main site
 * share one origin: every request outside /event goes to the main site's dev
 * server (its pages, sign-in and API), so its session cookie is set on this
 * origin and sign-in comes back to /event.
 */
function mainSiteProxy(origin) {
  const target = new URL(origin);
  const ownPaths = /^\/(?:event(?:[/?#]|$)|@|node_modules\/|src\/|__)/;

  function handle(req, res, next) {
    const url = req.url || '/';
    if (ownPaths.test(url)) return next();
    const upstream = http.request(
      { hostname: target.hostname, port: target.port, method: req.method, path: url, headers: req.headers },
      (reply) => {
        res.writeHead(reply.statusCode || 502, reply.headers);
        reply.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.statusCode = 502;
      res.end(`The main site's dev server is not running at ${origin}.`);
    });
    req.pipe(upstream);
  }

  return {
    name: 'unibooks-main-site-proxy',
    apply: 'serve',
    // A post hook that runs after Astro's, so this goes in front of Astro's
    // base middleware, which would answer any path outside /event with a 404.
    configureServer(server) {
      return () => server.middlewares.stack.unshift({ route: '', handle });
    },
  };
}

export default defineConfig({
  base: '/event',
  output: 'static',
  integrations: [workersAssetsIntegration()],
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
    imageService: 'passthrough',
  }),
  vite: {
    plugins: [mainSiteProxy(devEnv.MAIN_DEV_ORIGIN || 'http://localhost:8787')],
    ssr: {
      external: ['node:crypto', 'node:buffer'],
    },
  },
});
