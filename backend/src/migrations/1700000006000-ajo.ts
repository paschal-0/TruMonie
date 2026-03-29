import { MigrationInterface, QueryRunner } from 'typeorm';

export class Ajo1700000006000 implements MigrationInterface {
  name = 'Ajo1700000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "savings_groups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "name" character varying(120) NOT NULL,
        "created_by_id" uuid NOT NULL,
        "currency" "currency_enum" NOT NULL,
        "contribution_amount_minor" bigint NOT NULL,
        "member_target" integer NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "escrow_account_id" uuid,
        "payout_interval_days" integer NOT NULL DEFAULT 7,
        "next_payout_position" integer NOT NULL DEFAULT 1,
        "next_payout_date" TIMESTAMPTZ,
        "last_cycle_ref" character varying(64),
        CONSTRAINT "PK_savings_groups_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_savings_groups_user" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "group_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "group_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "position" integer NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "cycles_contributed" integer NOT NULL DEFAULT 0,
        "cycles_received" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_group_members_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_group_members_group" FOREIGN KEY ("group_id") REFERENCES "savings_groups"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_group_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "group_contributions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "group_id" uuid NOT NULL,
        "member_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "amount_minor" bigint NOT NULL,
        "currency" "currency_enum" NOT NULL,
        "cycle_ref" character varying(64) NOT NULL,
        "status" character varying(16) NOT NULL,
        CONSTRAINT "PK_group_contributions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_group_contributions_group" FOREIGN KEY ("group_id") REFERENCES "savings_groups"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_group_contributions_member" FOREIGN KEY ("member_id") REFERENCES "group_members"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_group_contributions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "group_payouts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "group_id" uuid NOT NULL,
        "member_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "amount_minor" bigint NOT NULL,
        "currency" "currency_enum" NOT NULL,
        "cycle_ref" character varying(64) NOT NULL,
        "status" character varying(16) NOT NULL,
        CONSTRAINT "PK_group_payouts_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_group_payouts_group" FOREIGN KEY ("group_id") REFERENCES "savings_groups"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_group_payouts_member" FOREIGN KEY ("member_id") REFERENCES "group_members"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_group_payouts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "group_activities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "group_id" uuid NOT NULL,
        "type" character varying(64) NOT NULL,
        "message" character varying(255) NOT NULL,
        CONSTRAINT "PK_group_activities_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_group_activities_group" FOREIGN KEY ("group_id") REFERENCES "savings_groups"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "group_activities";`);
    await queryRunner.query(`DROP TABLE "group_payouts";`);
    await queryRunner.query(`DROP TABLE "group_contributions";`);
    await queryRunner.query(`DROP TABLE "group_members";`);
    await queryRunner.query(`DROP TABLE "savings_groups";`);
  }
}
