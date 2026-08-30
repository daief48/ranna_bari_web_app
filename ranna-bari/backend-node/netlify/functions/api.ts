import awsLambdaFastify from '@fastify/aws-lambda';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { buildApp } from '../../src/app.js';
import { connect } from '../../src/config/db.js';

let proxy: ((event: APIGatewayProxyEvent, context: Context) => Promise<unknown>) | null = null;

export async function handler(event: APIGatewayProxyEvent, context: Context) {
  // Prevent AWS Lambda from waiting for MongoDB's open connection pool to drain
  context.callbackWaitsForEmptyEventLoop = false;

  // Attempt connecting to MongoDB (logs error if fails instead of crashing serverless container)
  try {
    await connect();
  } catch (err: any) {
    console.error('[MongoDB Connection Error]:', err?.message || err);
  }

  // Lazy initialize Fastify app instance once per Lambda container
  if (!proxy) {
    try {
      const app = await buildApp();
      proxy = awsLambdaFastify(app);
    } catch (err: any) {
      console.error('[Fastify Init Error]:', err?.message || err);
      return {
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          error: 'server-config-error',
          message: err?.message || 'Server environment configuration error.',
        }),
      };
    }
  }

  // If request path came prefixed with /.netlify/functions/api, normalize it for Fastify routes
  if (event.path && event.path.startsWith('/.netlify/functions/api')) {
    event.path = event.path.replace(/^\/\.netlify\/functions\/api/, '') || '/';
  }

  try {
    return await proxy(event, context);
  } catch (err: any) {
    console.error('[Proxy Error]:', err?.message || err);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: 'internal-error',
        message: err?.message || 'Request handling failed.',
      }),
    };
  }
}
