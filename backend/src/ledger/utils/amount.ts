import { BadRequestException } from '@nestjs/common';

export function addMinor(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}

export function subtractMinor(a: string, b: string): string {
  return (BigInt(a) - BigInt(b)).toString();
}

export function ensureNonNegative(value: string, label: string) {
  if (BigInt(value) < 0n) {
    throw new BadRequestException(`${label} would become negative`);
  }
}
