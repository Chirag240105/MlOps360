import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {createServer as createViteServer} from 'vite';
import {createApiApp} from './server/app.ts';
import {config} from './server/core/config.ts';
import {logger} from './server/core/logger.ts';

async function startServer(): Promise<void> {
  const app = createApiApp();

  if (config.appEnv !== 'production') {
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(config.port, '0.0.0.0', () => {
    logger.info('ModelOps360 server listening', {
      component: 'bootstrap',
      port: config.port,
      environment: config.appEnv,
    });
  });
}

startServer().catch((err: unknown) => {
  logger.error('Failed to start ModelOps360 server', {
    component: 'bootstrap',
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
