import { MigrationInterface, QueryRunner } from 'typeorm';

export class Notifications1700000014000 implements MigrationInterface {
  name = 'Notifications1700000014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "type" character varying(64) NOT NULL,
        "message" text NOT NULL,
        "payload" jsonb,
        "provider" character varying(50) NOT NULL,
        "provider_reference" character varying(120),
        "delivered" boolean NOT NULL DEFAULT false,
        "read_at" TIMESTAMPTZ,
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_user_id" ON "notifications" ("user_id");`);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_read_at" ON "notifications" ("read_at");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_notifications_read_at";`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_user_id";`);
    await queryRunner.query(`DROP TABLE "notifications";`);
  }
}
