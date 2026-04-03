import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlatformAdministration1700000027000 implements MigrationInterface {
  name = 'PlatformAdministration1700000027000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum')
          AND NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumtypid = 'user_role_enum'::regtype
              AND enumlabel = 'SUPER_ADMIN'
          )
        THEN
          ALTER TYPE "user_role_enum" ADD VALUE 'SUPER_ADMIN';
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum')
          AND NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumtypid = 'user_role_enum'::regtype
              AND enumlabel = 'COMPLIANCE_OFFICER'
          )
        THEN
          ALTER TYPE "user_role_enum" ADD VALUE 'COMPLIANCE_OFFICER';
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum')
          AND NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumtypid = 'user_role_enum'::regtype
              AND enumlabel = 'OPERATIONS_MANAGER'
          )
        THEN
          ALTER TYPE "user_role_enum" ADD VALUE 'OPERATIONS_MANAGER';
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum')
          AND NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumtypid = 'user_role_enum'::regtype
              AND enumlabel = 'FINANCE_OFFICER'
          )
        THEN
          ALTER TYPE "user_role_enum" ADD VALUE 'FINANCE_OFFICER';
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum')
          AND NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumtypid = 'user_role_enum'::regtype
              AND enumlabel = 'CUSTOMER_SUPPORT'
          )
        THEN
          ALTER TYPE "user_role_enum" ADD VALUE 'CUSTOMER_SUPPORT';
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum')
          AND NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumtypid = 'user_role_enum'::regtype
              AND enumlabel = 'AUDITOR'
          )
        THEN
          ALTER TYPE "user_role_enum" ADD VALUE 'AUDITOR';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'permission_action_enum') THEN
          CREATE TYPE "permission_action_enum" AS ENUM ('READ', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pending_action_status_enum') THEN
          CREATE TYPE "pending_action_status_enum" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'regulatory_submission_type_enum') THEN
          CREATE TYPE "regulatory_submission_type_enum" AS ENUM (
            'LICENSE_RENEWAL',
            'PERIODIC_RETURN',
            'INCIDENT_REPORT',
            'COMPLIANCE_ATTESTATION'
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'regulatory_submission_status_enum') THEN
          CREATE TYPE "regulatory_submission_status_enum" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'FAILED');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "email" character varying(255) NOT NULL,
        "name" character varying(200) NOT NULL,
        "role" "user_role_enum" NOT NULL,
        "department" character varying(50),
        "is_active" boolean NOT NULL DEFAULT true,
        "mfa_enabled" boolean NOT NULL DEFAULT true,
        "last_login_at" TIMESTAMPTZ,
        "password_hash" character varying(255) NOT NULL DEFAULT '',
        CONSTRAINT "PK_admin_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admin_users_email" UNIQUE ("email"),
        CONSTRAINT "UQ_admin_users_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_admin_users_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "permissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "role" "user_role_enum" NOT NULL,
        "resource" character varying(50) NOT NULL,
        "action" "permission_action_enum" NOT NULL,
        "requires_checker" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_permissions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_permissions_role_resource_action" UNIQUE ("role", "resource", "action")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pending_actions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "action_type" character varying(50) NOT NULL,
        "resource_type" character varying(50) NOT NULL,
        "resource_id" uuid NOT NULL,
        "payload" jsonb NOT NULL,
        "maker_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "maker_reason" text NOT NULL,
        "checker_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "checker_reason" text,
        "status" "pending_action_status_enum" NOT NULL DEFAULT 'PENDING',
        "expires_at" TIMESTAMPTZ NOT NULL,
        "resolved_at" TIMESTAMPTZ,
        CONSTRAINT "PK_pending_actions_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_pending_actions_maker_checker" CHECK ("checker_id" IS NULL OR "maker_id" <> "checker_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pending_actions_status_created_at" ON "pending_actions" ("status", "created_at")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pending_actions_action_type_status" ON "pending_actions" ("action_type", "status")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "system_config" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "config_key" character varying(100) NOT NULL,
        "config_value" jsonb NOT NULL,
        "description" text,
        "changed_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "version" integer NOT NULL DEFAULT 1,
        "is_active" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_system_config_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_system_config_key_version" UNIQUE ("config_key", "version")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_system_config_key_active" ON "system_config" ("config_key", "is_active")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "regulatory_submissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "submission_type" "regulatory_submission_type_enum" NOT NULL,
        "report_type" character varying(60),
        "period" character varying(30),
        "payload" jsonb NOT NULL,
        "slsg_reference" character varying(120),
        "status" "regulatory_submission_status_enum" NOT NULL DEFAULT 'PENDING',
        "status_message" text,
        "submitted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "submitted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_regulatory_submissions_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_regulatory_submissions_type_created_at" ON "regulatory_submissions" ("submission_type", "created_at")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_regulatory_submissions_status_created_at" ON "regulatory_submissions" ("status", "created_at")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_regulatory_submissions_status_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_regulatory_submissions_type_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "regulatory_submissions"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_system_config_key_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "system_config"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pending_actions_action_type_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pending_actions_status_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pending_actions"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_users"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "regulatory_submission_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "regulatory_submission_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "pending_action_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "permission_action_enum"`);
  }
}
