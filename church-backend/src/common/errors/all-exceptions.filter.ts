import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AppException } from './app.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (exception instanceof AppException) {
      return res.status(exception.getStatus()).json(exception.getResponse());
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body: any = exception.getResponse();
      if (status === 400 && Array.isArray(body?.message)) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message_ar: 'بيانات غير صالحة',
          message_en: 'Validation failed',
          details: body.message,
        });
      }
      const map: Record<number, [string, string, string]> = {
        401: ['UNAUTHORIZED', 'يجب تسجيل الدخول', 'Authentication required'],
        403: ['FORBIDDEN', 'ليست لديك صلاحية', 'Permission denied'],
        404: ['NOT_FOUND', 'غير موجود', 'Not found'],
        429: ['RATE_LIMITED', 'محاولات كثيرة، حاول لاحقًا', 'Too many requests'],
      };
      const [code, ar, en] = map[status] ?? ['ERROR', 'حدث خطأ', 'Error'];
      return res.status(status).json({ code, message_ar: ar, message_en: en });
    }
    // Unknown error: log internally, never leak details to the client.
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message_ar: 'حدث خطأ غير متوقع',
      message_en: 'Unexpected error',
    });
  }
}
