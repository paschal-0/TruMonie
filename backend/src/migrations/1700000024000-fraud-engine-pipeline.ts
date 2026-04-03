import { MigrationInterface, QueryRunner } from 'typeorm';

export class FraudEnginePipeline1700000024000 implements MigrationInterface {
  name = 'FraudEnginePipeline1700000024000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fraud_event_status_enum') THEN
          CREATE TYPE "fraud_event_status_enum" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fraud_events_currency_enum') THEN
          CREATE TYPE "fraud_events_currency_enum" AS ENUM ('NGN', 'USD');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fraud_events_destination_type_enum') THEN
          CREATE TYPE "fraud_events_destination_type_enum" AS ENUM ('INTERNAL', 'NIP');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fraud_transaction_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "event_type" character varying(50) NOT NULL DEFAULT 'TRANSFER_INITIATED',
        "source_type" character varying(30) NOT NULL DEFAULT 'TRANSFER',
        "user_id" uuid NOT NULL,
        "transaction_id" uuid,
        "transaction_reference" character varying(100),
        "amount_minor" bigint NOT NULL,
        "currency" "fraud_events_currency_enum" NOT NULL DEFAULT 'NGN',
        "destination_type" "fraud_events_destination_type_enum" NOT NULL,
        "destination_account" character varying(20),
        "destination_bank" character varying(10),
        "source_balance_minor" bigint,
        "metadata" jsonb,
        "status" "fraud_event_status_enum" NOT NULL DEFAULT 'PENDING',
        "processed_at" TIMESTAMPTZ,
        "error_message" text,
        "fraud_alert_id" uuid,
        "decision" "fraud_decision_enum",
        "risk_score" integer,
        CONSTRAINT "PK_fraud_transaction_events_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_fraud_transaction_events_status_created_at"
      ON "fraud_transaction_events" ("status", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_fraud_transaction_events_user_created_at"
      ON "fraud_transaction_events" ("user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_fraud_transaction_events_transaction_reference"
      ON "fraud_transaction_events" ("transaction_reference")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fraud_transaction_events_transaction_reference"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fraud_transaction_events_user_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fraud_transaction_events_status_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fraud_transaction_events"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fraud_events_destination_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fraud_events_currency_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fraud_event_status_enum"`);
  }
}
