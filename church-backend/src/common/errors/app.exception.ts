import { HttpException } from '@nestjs/common';

/** Every business error carries a stable code + Arabic/English messages. */
export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    public readonly messageAr: string,
    public readonly messageEn: string,
    status = 400,
    public readonly details?: unknown,
  ) {
    super({ code, message_ar: messageAr, message_en: messageEn, details }, status);
  }
}
