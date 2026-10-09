import { Module } from '@nestjs/common';
import { ServantsController } from './servants.controller';
import { ServantsService } from './servants.service';

@Module({ controllers: [ServantsController], providers: [ServantsService], exports: [ServantsService] })
export class ServantsModule {}
