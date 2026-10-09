import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string;
  deviceId?: string | null;
  metadata?: Record<string, unknown>;
}

const SENSITIVE = ['password', 'passwordHash', 'token', 'refreshToken'];
const scrub = (v: unknown): any => {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v, (k, val) => (SENSITIVE.includes(k) ? '[REDACTED]' : val)));
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(private prisma: PrismaService) {}

  /** Never throws: an audit failure must not break the business flow, but it is logged loudly. */
  async log(e: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: e.userId ?? null,
          action: e.action,
          entity: e.entity,
          entityId: e.entityId,
          oldValue: scrub(e.oldValue) as Prisma.InputJsonValue,
          newValue: scrub(e.newValue) as Prisma.InputJsonValue,
          ip: e.ip,
          deviceId: e.deviceId ?? undefined,
          metadata: scrub(e.metadata) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.error(`AUDIT WRITE FAILED action=${e.action}`, err instanceof Error ? err.stack : String(err));
    }
  }
}
