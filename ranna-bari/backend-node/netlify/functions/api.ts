import awsLambdaFastify from '@fastify/aws-lambda';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { buildApp } from '../../src/app.js';
import { connect } from '../../src/config/db.js';

let proxy: ((event: APIGatewayProxyEvent, context: Context) => Promise<unknown>) | null = null;

export async function handler(event: APIGatewayProxyEvent, context: Context) {
  // Prevent AWS Lambda from waiting for MongoDB's open connection pool to drain
  context.callbackWaitsForEmptyEventLoop = false;

  // Connect to MongoDB Atlas (reuses existing connection if already connected)
  await connect();

  // Lazy initialize Fastify app instance once per Lambda container
  if (!proxy) {
    const app = await buildApp();
    await app.ready();
    proxy = awsLambdaFastify(app);
  }

  // If request path came prefixed with /.netlify/functions/api, normalize it for Fastify routes
  if (event.path && event.path.startsWith('/.netlify/functions/api')) {
    event.path = event.path.replace(/^\/\.netlify\/functions\/api/, '') || '/';
  }

  return proxy(event, context);
}
