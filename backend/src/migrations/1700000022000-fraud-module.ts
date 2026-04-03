import { MigrationInterface, QueryRunner } from 'typeorm';

export class FraudModule1700000022000 implements MigrationInterface {
  name = 'FraudModule1700000022000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fraud_report_type_enum') THEN
          CREATE TYPE "fraud_report_type_enum" AS ENUM ('APP_FRAUD');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fraud_report_status_enum') THEN
          CREATE TYPE "fraud_report_status_enum" AS ENUM (
            'RECEIVED',
            'BENEFICIARY_BANK_NOTIFIED',
            'INVESTIGATION_OVERDUE',
            'RESOLVED',
            'ESCALATED_NFIU'
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fraud_decision_enum') THEN
          CREATE TYPE "fraud_decision_enum" AS ENUM ('ALLOW', 'REVIEW', 'BLOCKED');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fraud_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "transaction_id" uuid NOT NULL,
        "report_type" "fraud_report_type_enum" NOT NULL,
        "description" text NOT NULL,
        "reported_amount_minor" bigint NOT NULL,
        "status" "fraud_report_status_enum" NOT NULL DEFAULT 'RECEIVED',
        "beneficiary_bank_notified" boolean NOT NULL DEFAULT false,
        "notification_sent_at" TIMESTAMPTZ,
        "resolution_deadline_at" TIMESTAMPTZ NOT NULL,
        "nfiu_report_due_at" TIMESTAMPTZ NOT NULL,
        "nfiu_reported" boolean NOT NULL DEFAULT false,
        "nfiu_reported_at" TIMESTAMPTZ,
        "resolved_at" TIMESTAMPTZ,
        "metadata" jsonb,
        CONSTRAINT "PK_fraud_reports_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_fraud_reports_tx_type_user" UNIQUE ("transaction_id", "report_type", "user_id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_fraud_reports_status_notification"
      ON "fraud_reports" ("status", "notification_sent_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_fraud_reports_status_resolution"
      ON "fraud_reports" ("status", "resolution_deadline_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_fraud_reports_status_nfiu_due"
      ON "fraud_reports" ("status", "nfiu_report_due_at")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fraud_alerts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "transaction_id" uuid,
        "transaction_reference" character varying(100),
        "risk_score" integer NOT NULL,
        "decision" "fraud_decision_enum" NOT NULL,
        "reasons" jsonb NOT NULL,
        "model_version" character varying(32) NOT NULL,
        "feature_importances" jsonb,
        "recommended_action" character varying(64) NOT NULL,
        "generated_at" TIMESTAMPTZ NOT NULL,
        CONSTRAINT "PK_fraud_alerts_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_fraud_alerts_user_generated"
      ON "fraud_alerts" ("user_id", "generated_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_fraud_alerts_decision_generated"
      ON "fraud_alerts" ("decision", "generated_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_fraud_alerts_transaction_id"
      ON "fraud_alerts" ("transaction_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fraud_alerts_transaction_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fraud_alerts_decision_generated"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fraud_alerts_user_generated"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fraud_alerts"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fraud_reports_status_nfiu_due"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fraud_reports_status_resolution"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fraud_reports_status_notification"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fraud_reports"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "fraud_decision_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fraud_report_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fraud_report_type_enum"`);
  }
}
