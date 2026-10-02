import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('API Error:', err);

  // If response headers have already been sent (e.g. during SSE streaming), delegate to default handler
  if (res.headersSent) {
    return _next(err);
  }

  let status = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';

  // 1. Database Failures (Prisma Connection, Timeout, Unique/Not Found)
  if (
    err.name === 'PrismaClientInitializationError' ||
    err.code === 'P1001' ||
    err.code === 'P1002' ||
    err.message?.includes("Can't reach database server")
  ) {
    status = 503;
    message = 'Database service unavailable: Could not connect to PostgreSQL database server. Please check database connectivity.';
  } else if (err.code === 'P2025') {
    status = 404;
    message = 'The requested database record was not found.';
  } else if (err.code === 'P2002') {
    status = 409;
    message = 'A record with this unique identifier already exists.';
  }

  // 2. Bad Request / JSON Parse Failures
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    status = 400;
    message = 'Invalid JSON syntax in request body.';
  }

  // 3. File Upload / Multer Limits
  if (err.name === 'MulterError') {
    status = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size exceeds maximum allowed upload limit (50MB).';
    }
  }

  return res.status(status).json({
    success: false,
    error: message,
    code: err.code || undefined,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
}
