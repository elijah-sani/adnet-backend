import { Module } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
  ],
  controllers: [ReconciliationController],
  providers: [ReconciliationService, SchedulerRegistry],
})
export class ReconciliationModule { }
