import { MigrationInterface, QueryRunner } from 'typeorm';

export class MerchantPosProductionHardening1700000020000 implements MigrationInterface {
  name = 'MerchantPosProductionHardening1700000020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumtypid = 'settlement_cycle_enum'::regtype
            AND enumlabel = 'T0'
        ) THEN
          ALTER TYPE "settlement_cycle_enum" ADD VALUE 'T0';
        END IF;
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumtypid = 'settlement_cycle_enum'::regtype
            AND enumlabel = 'T1'
        ) THEN
          ALTER TYPE "settlement_cycle_enum" ADD VALUE 'T1';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "settlement_cycle" "settlement_cycle_enum" NOT NULL DEFAULT 'T1'`
    );

    await queryRunner.query(
      `ALTER TABLE "merchant_transactions" ADD COLUMN IF NOT EXISTS "settlement_id" uuid`
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_transactions" ADD COLUMN IF NOT EXISTS "settled_at" TIMESTAMPTZ`
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_merchant_transactions_settlement'
            AND table_name = 'merchant_transactions'
        ) THEN
          ALTER TABLE "merchant_transactions"
          ADD CONSTRAINT "FK_merchant_transactions_settlement"
          FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_merchant_transactions_settlement_id" ON "merchant_transactions" ("settlement_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_merchant_transactions_status_posted_at" ON "merchant_transactions" ("status", "posted_at")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_merchant_transactions_status_posted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_merchant_transactions_settlement_id"`);
    await queryRunner.query(
      `ALTER TABLE "merchant_transactions" DROP CONSTRAINT IF EXISTS "FK_merchant_transactions_settlement"`
    );
    await queryRunner.query(`ALTER TABLE "merchant_transactions" DROP COLUMN IF EXISTS "settled_at"`);
    await queryRunner.query(`ALTER TABLE "merchant_transactions" DROP COLUMN IF EXISTS "settlement_id"`);
    await queryRunner.query(`ALTER TABLE "merchants" DROP COLUMN IF EXISTS "settlement_cycle"`);
  }
}

