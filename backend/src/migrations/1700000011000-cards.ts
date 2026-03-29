import { MigrationInterface, QueryRunner } from 'typeorm';

export class Cards1700000011000 implements MigrationInterface {
  name = 'Cards1700000011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cards" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "funding_account_id" uuid NOT NULL,
        "currency" character varying(16) NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "type" character varying(16) NOT NULL DEFAULT 'VIRTUAL',
        "provider" character varying(64) NOT NULL,
        "provider_reference" character varying(128) NOT NULL,
        "last4" character varying(4) NOT NULL,
        CONSTRAINT "PK_cards_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cards_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cards";`);
  }
}
