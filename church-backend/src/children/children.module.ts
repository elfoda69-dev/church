import { Module } from '@nestjs/common';
import { ChildrenController, ParentsController } from './children.controller';
import { ChildrenService } from './children.service';

@Module({ controllers: [ChildrenController, ParentsController], providers: [ChildrenService], exports: [ChildrenService] })
export class ChildrenModule {}
