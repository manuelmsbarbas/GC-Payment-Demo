import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import routes from './routes';

const app = express();

// Raw body must be captured before json() for the webhook route
app.use('/webhooks', express.raw({ type: 'application/json' }));

app.use(cors({ origin: env.clientOrigin }));
app.use(express.json());

app.use(routes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const server = app.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port}`);
});

function shutdown(): void {
  console.log('Shutting down...');
  server.close();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
