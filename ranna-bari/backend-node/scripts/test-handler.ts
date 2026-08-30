import { handler } from '../netlify/functions/api.js';

async function test() {
  console.log('Testing handler with /health...');
  // Dummy event
  const mockEvent: any = {
    path: '/health',
    httpMethod: 'GET',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    isBase64Encoded: false,
    body: null,
  };

  const mockContext: any = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'api',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:...',
    memoryLimitInMB: '1024',
    awsRequestId: 'req-1',
    logGroupName: 'log-group',
    logStreamName: 'log-stream',
    getRemainingTimeInMillis: () => 10000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  try {
    const res: any = await handler(mockEvent, mockContext);
    console.log('Handler response status:', res.statusCode);
    console.log('Handler response body:', res.body);
  } catch (err) {
    console.error('Handler error:', err);
  }
}

test();
