import { MigrationInterface, QueryRunner } from 'typeorm';

export class RiskControls1700000012000 implements MigrationInterface {
  name = 'RiskControls1700000012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "device_status_enum" AS ENUM ('ACTIVE', 'BLOCKED');`);

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid,
        "action" character varying(64) NOT NULL,
        "metadata" jsonb,
        CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_logs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_user_id" ON "audit_logs" ("user_id");`);

    await queryRunner.query(`
      CREATE TABLE "user_devices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "fingerprint" character varying(128) NOT NULL,
        "device_type" character varying(64),
        "status" "device_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "last_seen_at" TIMESTAMPTZ,
        CONSTRAINT "PK_user_devices_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_devices_user_fingerprint" UNIQUE ("user_id", "fingerprint"),
        CONSTRAINT "FK_user_devices_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_user_devices_user_id" ON "user_devices" ("user_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_user_devices_user_id";`);
    await queryRunner.query(`DROP TABLE "user_devices";`);
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_user_id";`);
    await queryRunner.query(`DROP TABLE "audit_logs";`);
    await queryRunner.query(`DROP TYPE "device_status_enum";`);
  }
}
