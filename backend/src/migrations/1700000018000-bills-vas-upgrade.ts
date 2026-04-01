import { MigrationInterface, QueryRunner } from 'typeorm';

export class BillsVasUpgrade1700000018000 implements MigrationInterface {
  name = 'BillsVasUpgrade1700000018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bill_validation_status_enum') THEN
          CREATE TYPE "bill_validation_status_enum" AS ENUM ('PENDING', 'USED', 'EXPIRED');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bill_validations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "wallet_id" uuid,
        "biller_id" character varying(64) NOT NULL,
        "category" character varying(30) NOT NULL,
        "provider" character varying(30) NOT NULL,
        "request_fields" jsonb NOT NULL,
        "customer_name" character varying(200),
        "customer_address" character varying(300),
        "customer_ref" character varying(128),
        "outstanding_balance_minor" bigint NOT NULL DEFAULT 0,
        "minimum_amount_minor" bigint NOT NULL DEFAULT 0,
        "status" "bill_validation_status_enum" NOT NULL DEFAULT 'PENDING',
        "metadata" jsonb,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "used_at" TIMESTAMPTZ,
        CONSTRAINT "PK_bill_validations_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bill_validations_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bill_validations_wallet" FOREIGN KEY ("wallet_id") REFERENCES "accounts"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bill_validations_user_biller_status"
      ON "bill_validations" ("user_id", "biller_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bill_validations_expires_at"
      ON "bill_validations" ("expires_at")
    `);

    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "reference" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "wallet_id" uuid`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "biller_id" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "category" character varying(30)`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "validation_ref" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "customer_name" character varying(200)`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "customer_ref" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "fee_minor" bigint NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "token" text`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "units" character varying(50)`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "aggregator" character varying(30)`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "aggregator_ref" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "idempotency_key" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMPTZ`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "session_id" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "bill_payments" ADD COLUMN IF NOT EXISTS "receipt" jsonb`);

    await queryRunner.query(`
      UPDATE "bill_payments"
      SET
        "reference" = COALESCE("reference", 'BILL-LEGACY-' || SUBSTRING("id"::text, 1, 12)),
        "wallet_id" = COALESCE("wallet_id", "source_account_id"),
        "biller_id" = COALESCE("biller_id", "request"->>'productCode'),
        "category" = COALESCE("category", LOWER(COALESCE("request"->>'category', 'other'))),
        "customer_ref" = COALESCE("customer_ref", "request"->>'beneficiary'),
        "aggregator" = COALESCE("aggregator", "provider"),
        "aggregator_ref" = COALESCE("aggregator_ref", "provider_reference")
      WHERE true
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_bill_payments_reference"
      ON "bill_payments" ("reference")
      WHERE "reference" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_bill_payments_idempotency_key"
      ON "bill_payments" ("idempotency_key")
      WHERE "idempotency_key" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bill_payments_user_category_status_created_at"
      ON "bill_payments" ("user_id", "category", "status", "created_at")
    `);

    await queryRunner.query(
      `ALTER TABLE "bill_beneficiaries" ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMPTZ`
    );
    await queryRunner.query(
      `ALTER TABLE "bill_beneficiaries" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ`
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_bill_beneficiaries_user_product_destination"
      ON "bill_beneficiaries" ("user_id", "product_code", "destination")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_bill_beneficiaries_user_product_destination"`);
    await queryRunner.query(`ALTER TABLE "bill_beneficiaries" DROP COLUMN IF EXISTS "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "bill_beneficiaries" DROP COLUMN IF EXISTS "last_used_at"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bill_payments_user_category_status_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_bill_payments_idempotency_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_bill_payments_reference"`);

    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "receipt"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "session_id"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "completed_at"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "idempotency_key"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "aggregator_ref"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "aggregator"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "units"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "token"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "fee_minor"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "customer_ref"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "customer_name"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "validation_ref"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "category"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "biller_id"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "wallet_id"`);
    await queryRunner.query(`ALTER TABLE "bill_payments" DROP COLUMN IF EXISTS "reference"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bill_validations_expires_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bill_validations_user_biller_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bill_validations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bill_validation_status_enum"`);
  }
}

