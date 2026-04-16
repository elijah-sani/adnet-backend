import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionsTable1700000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the status enum type
    await queryRunner.query(`
      CREATE TYPE "transactions_status_enum" AS ENUM (
        'pending',
        'success',
        'failed'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id"             UUID                          NOT NULL DEFAULT uuid_generate_v4(),
        "instructionId"  VARCHAR                       NOT NULL,
        "accountId"      VARCHAR                       NOT NULL,
        "amount"         INTEGER                       NOT NULL,
        "currency"       VARCHAR                       NOT NULL DEFAULT 'NGN',
        "narration"      VARCHAR                       NOT NULL,
        "requestedAt"    TIMESTAMP WITH TIME ZONE      NOT NULL,
        "status"         "transactions_status_enum"    NOT NULL DEFAULT 'pending',
        "transactionRef" VARCHAR                       UNIQUE,
        "processedAt"    TIMESTAMP WITH TIME ZONE,
        "balanceAfter"   INTEGER,
        "failureReason"  VARCHAR,
        "createdAt"      TIMESTAMP WITH TIME ZONE      NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transactions_instructionId" UNIQUE ("instructionId")
      )
    `);

    // Explicit unique index on instructionId (matches @Index decorator on entity)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_IDX_transactions_instructionId"
        ON "transactions" ("instructionId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_IDX_transactions_instructionId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "transactions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transactions_status_enum"`);
  }
}
