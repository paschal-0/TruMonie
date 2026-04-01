import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const normalized = this.normalizeException(exception, status);
    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
        path: request.url,
        timestamp: new Date().toISOString()
      }
    });
  }

  private normalizeException(exception: unknown, status: number) {
    if (exception instanceof HttpException) {
      const raw = exception.getResponse();
      if (typeof raw === 'string') {
        return { code: this.codeForStatus(status), message: raw, details: null };
      }

      const payload = raw as Record<string, unknown>;
      const message = payload.message ?? exception.message;
      const error = payload.error;

      return {
        code:
          typeof payload.code === 'string'
            ? payload.code
            : typeof error === 'string'
            ? error.toUpperCase().replace(/\s+/g, '_')
            : this.codeForStatus(status),
        message: Array.isArray(message) ? 'Validation failed' : String(message ?? 'Request failed'),
        details: Array.isArray(message) ? message : payload
      };
    }

    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : undefined);
    return {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      details: null
    };
  }

  private codeForStatus(status: number) {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      default:
        return 'ERROR';
    }
  }
}
