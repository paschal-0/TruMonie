import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsername1700000003000 implements MigrationInterface {
  name = 'AddUsername1700000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "username" character varying(50) NOT NULL DEFAULT 'temp';`
    );
    await queryRunner.query(`UPDATE "users" SET "username" = LOWER("email");`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "username" DROP DEFAULT;`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_users_username" UNIQUE ("username");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_users_username";`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "username";`);
  }
}
