import { Controller, Get } from '@nestjs/common';
import {
  ReconciliationService,
  ReconciliationStatus,
} from './reconciliation.service';

@Controller('api/v1/reconciliation')
export class ReconciliationController {
  constructor(
    private readonly reconciliationService: ReconciliationService,
  ) {}

  /**
   * GET /api/v1/reconciliation/status
   *
   * Returns the last cron run time, how many transactions were
   * resolved in that run, and the live count of pending transactions.
   */
  @Get('status')
  async getStatus(): Promise<ReconciliationStatus> {
    return this.reconciliationService.getStatus();
  }
}
