import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export const skipTake = (q: PageQuery) => ({ skip: (q.page - 1) * q.limit, take: q.limit });
export const paged = <T>(data: T[], total: number, q: PageQuery) => ({ data, meta: { page: q.page, limit: q.limit, total } });
