import { IsArray, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class LivenessSubmitDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsArray()
  frames!: string[];

  @IsObject()
  deviceSensors!: Record<string, unknown>;
}
