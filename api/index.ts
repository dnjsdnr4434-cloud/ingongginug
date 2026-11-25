import type { IncomingMessage, ServerResponse } from 'http';
import { createApiApp } from '../server/apiApp';

export const config = {
  maxDuration: 30,
};

const app = createApiApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req as any, res as any);
}
