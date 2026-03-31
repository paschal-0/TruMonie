import { MigrationInterface, QueryRunner } from 'typeorm';

export class OnboardingKycHardening1700000015000 implements MigrationInterface {
  name = 'OnboardingKycHardening1700000015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'limit_tier_enum')
          AND NOT EXISTS (
            SELECT 1
            FROM pg_enum
            WHERE enumtypid = 'limit_tier_enum'::regtype
              AND enumlabel = 'TIER3'
          )
        THEN
          ALTER TYPE "limit_tier_enum" ADD VALUE 'TIER3';
        END IF;
      END
      $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_number_source" character varying(16) NOT NULL DEFAULT 'SYSTEM'`
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_status_enum')
          AND NOT EXISTS (
            SELECT 1
            FROM pg_enum
            WHERE enumtypid = 'device_status_enum'::regtype
              AND enumlabel = 'INACTIVE'
          )
        THEN
          ALTER TYPE "device_status_enum" ADD VALUE 'INACTIVE';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "user_devices" ADD COLUMN IF NOT EXISTS "hardware_id" character varying(128)`
    );
    await queryRunner.query(
      `ALTER TABLE "user_devices" ADD COLUMN IF NOT EXISTS "platform" character varying(20)`
    );
    await queryRunner.query(
      `ALTER TABLE "user_devices" ADD COLUMN IF NOT EXISTS "os_version" character varying(20)`
    );
    await queryRunner.query(
      `ALTER TABLE "user_devices" ADD COLUMN IF NOT EXISTS "app_version" character varying(20)`
    );
    await queryRunner.query(
      `ALTER TABLE "user_devices" ADD COLUMN IF NOT EXISTS "bound_at" TIMESTAMPTZ`
    );
    await queryRunner.query(
      `ALTER TABLE "user_devices" ADD COLUMN IF NOT EXISTS "unbound_at" TIMESTAMPTZ`
    );
    await queryRunner.query(`
      UPDATE "user_devices"
      SET "bound_at" = COALESCE("bound_at", "created_at")
      WHERE "bound_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_devices_user_active"
      ON "user_devices" ("user_id")
      WHERE "status" = 'ACTIVE'
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'circuit_breaker_type_enum') THEN
          CREATE TYPE "circuit_breaker_type_enum" AS ENUM ('NEW_DEVICE');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "circuit_breakers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "type" "circuit_breaker_type_enum" NOT NULL,
        "max_amount_minor" bigint NOT NULL,
        "activated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMPTZ NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_circuit_breakers_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_circuit_breakers_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_circuit_breakers_user_type" ON "circuit_breakers" ("user_id", "type")`
    );

    await queryRunner.query(
      `ALTER TABLE "user_kyc_data" ADD COLUMN IF NOT EXISTS "bvn_hash" character varying(128)`
    );
    await queryRunner.query(
      `ALTER TABLE "user_kyc_data" ADD COLUMN IF NOT EXISTS "nin_hash" character varying(128)`
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_kyc_data_bvn_hash"
      ON "user_kyc_data" ("bvn_hash")
      WHERE "bvn_hash" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_kyc_data_nin_hash"
      ON "user_kyc_data" ("nin_hash")
      WHERE "nin_hash" IS NOT NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_verification_type_enum') THEN
          CREATE TYPE "kyc_verification_type_enum" AS ENUM ('BVN', 'NIN', 'LIVENESS', 'ADDRESS', 'GOVERNMENT_ID');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_verification_status_enum') THEN
          CREATE TYPE "kyc_verification_status_enum" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "kyc_verifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "type" "kyc_verification_type_enum" NOT NULL,
        "provider" character varying(32) NOT NULL,
        "reference_encrypted" character varying(512),
        "match_score" integer,
        "status" "kyc_verification_status_enum" NOT NULL DEFAULT 'PENDING',
        "metadata" jsonb,
        "verified_at" TIMESTAMPTZ,
        "expires_at" TIMESTAMPTZ,
        CONSTRAINT "PK_kyc_verifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_kyc_verifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_kyc_verifications_user_type_status" ON "kyc_verifications" ("user_id", "type", "status")`
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "onboarding_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "event_type" character varying(64) NOT NULL,
        "payload" jsonb NOT NULL,
        "published_at" TIMESTAMPTZ,
        CONSTRAINT "PK_onboarding_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_onboarding_events_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_onboarding_events_type_published_at" ON "onboarding_events" ("event_type", "published_at")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_onboarding_events_type_published_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "onboarding_events"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_kyc_verifications_user_type_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kyc_verifications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "kyc_verification_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "kyc_verification_type_enum"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_user_kyc_data_nin_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_user_kyc_data_bvn_hash"`);
    await queryRunner.query(`ALTER TABLE "user_kyc_data" DROP COLUMN IF EXISTS "nin_hash"`);
    await queryRunner.query(`ALTER TABLE "user_kyc_data" DROP COLUMN IF EXISTS "bvn_hash"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_circuit_breakers_user_type"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "circuit_breakers"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "circuit_breaker_type_enum"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_user_devices_user_active"`);
    await queryRunner.query(`ALTER TABLE "user_devices" DROP COLUMN IF EXISTS "unbound_at"`);
    await queryRunner.query(`ALTER TABLE "user_devices" DROP COLUMN IF EXISTS "bound_at"`);
    await queryRunner.query(`ALTER TABLE "user_devices" DROP COLUMN IF EXISTS "app_version"`);
    await queryRunner.query(`ALTER TABLE "user_devices" DROP COLUMN IF EXISTS "os_version"`);
    await queryRunner.query(`ALTER TABLE "user_devices" DROP COLUMN IF EXISTS "platform"`);
    await queryRunner.query(`ALTER TABLE "user_devices" DROP COLUMN IF EXISTS "hardware_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "account_number_source"`);
  }
}
