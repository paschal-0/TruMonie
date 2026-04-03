import { MigrationInterface, QueryRunner } from 'typeorm';

export class ComplianceAuditUpgrade1700000023000 implements MigrationInterface {
  name = 'ComplianceAuditUpgrade1700000023000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_actor_type_enum') THEN
          CREATE TYPE "audit_actor_type_enum" AS ENUM ('USER', 'ADMIN', 'SYSTEM');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action_type_enum') THEN
          CREATE TYPE "audit_action_type_enum" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'VIEW');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'compliance_risk_level_enum') THEN
          CREATE TYPE "compliance_risk_level_enum" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'compliance_resolution_enum') THEN
          CREATE TYPE "compliance_resolution_enum" AS ENUM ('CLEARED', 'ESCALATED', 'REPORTED');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "event_type" character varying(50)`
    );
    await queryRunner.query(`
      ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_type" "audit_actor_type_enum" NOT NULL DEFAULT 'USER'
    `);
    await queryRunner.query(`
      ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "resource_type" character varying(50) NOT NULL DEFAULT 'SYSTEM'
    `);
    await queryRunner.query(`
      ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "resource_id" uuid NOT NULL DEFAULT uuid_generate_v4()
    `);
    await queryRunner.query(`
      ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "action_type" "audit_action_type_enum" NOT NULL DEFAULT 'UPDATE'
    `);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "before_state" jsonb`
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "after_state" jsonb`
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "ip_address" inet`
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "user_agent" text`
    );
    await queryRunner.query(`
      ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "correlation_id" uuid NOT NULL DEFAULT uuid_generate_v4()
    `);

    await queryRunner.query(`
      UPDATE "audit_logs"
      SET
        "event_type" = COALESCE("event_type", "action"),
        "resource_id" = COALESCE("resource_id", "user_id", uuid_generate_v4()),
        "action_type" = CASE
          WHEN UPPER("action") LIKE '%CREATE%' OR UPPER("action") LIKE '%SUBMITTED%' THEN 'CREATE'::audit_action_type_enum
          WHEN UPPER("action") LIKE '%DELETE%' OR UPPER("action") LIKE '%REMOVE%' THEN 'DELETE'::audit_action_type_enum
          WHEN UPPER("action") LIKE '%VIEW%' OR UPPER("action") LIKE '%READ%' THEN 'VIEW'::audit_action_type_enum
          ELSE COALESCE("action_type", 'UPDATE'::audit_action_type_enum)
        END,
        "correlation_id" = COALESCE("correlation_id", uuid_generate_v4())
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_correlation_id" ON "audit_logs" ("correlation_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_event_type_created_at" ON "audit_logs" ("event_type", "created_at")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_resource" ON "audit_logs" ("resource_type", "resource_id")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "compliance_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "event_type" character varying(50) NOT NULL,
        "reference_id" uuid NOT NULL,
        "user_id" uuid,
        "risk_level" "compliance_risk_level_enum" NOT NULL,
        "details" jsonb NOT NULL,
        "resolution" "compliance_resolution_enum",
        "resolved_by" uuid,
        "resolved_at" TIMESTAMPTZ,
        "nfiu_reported" boolean NOT NULL DEFAULT false,
        "nfiu_report_ref" character varying(100),
        CONSTRAINT "PK_compliance_events_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_events_event_type_created_at" ON "compliance_events" ("event_type", "created_at")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_events_risk_created_at" ON "compliance_events" ("risk_level", "created_at")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_compliance_events_resolution_resolved_at" ON "compliance_events" ("resolution", "resolved_at")`
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs is append-only';
      END;
      $$;
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON "audit_logs"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_no_delete ON "audit_logs"`);
    await queryRunner.query(`
      CREATE TRIGGER trg_audit_logs_no_update
      BEFORE UPDATE ON "audit_logs"
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation()
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_audit_logs_no_delete
      BEFORE DELETE ON "audit_logs"
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON "audit_logs"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_no_delete ON "audit_logs"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_audit_log_mutation`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compliance_events_resolution_resolved_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compliance_events_risk_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compliance_events_event_type_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "compliance_events"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_resource"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_event_type_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_correlation_id"`);

    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "correlation_id"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "user_agent"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "ip_address"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "after_state"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "before_state"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "action_type"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "resource_id"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "resource_type"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "actor_type"`);
    await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "event_type"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "compliance_resolution_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "compliance_risk_level_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "audit_action_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "audit_actor_type_enum"`);
  }
}
