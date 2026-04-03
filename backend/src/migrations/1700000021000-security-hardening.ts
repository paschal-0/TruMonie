import { MigrationInterface, QueryRunner } from 'typeorm';

export class SecurityHardening1700000021000 implements MigrationInterface {
  name = 'SecurityHardening1700000021000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "pin_history" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "pin_failed_attempts" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "pin_lock_level" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "pin_lock_until" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "pin_updated_at" TIMESTAMPTZ
    `);

    await queryRunner.query(`
      UPDATE "users"
      SET
        "pin_history" = COALESCE("pin_history", '[]'::jsonb),
        "pin_failed_attempts" = COALESCE("pin_failed_attempts", 0),
        "pin_lock_level" = COALESCE("pin_lock_level", 0),
        "pin_updated_at" = COALESCE("pin_updated_at", "updated_at")
      WHERE "pin_hash" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "pin_updated_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "pin_lock_until"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "pin_lock_level"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "pin_failed_attempts"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "pin_history"`);
  }
}
