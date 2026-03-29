import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

import { snakeCase } from '../utils/case';

// Simple snake_case naming strategy to avoid peer dependency issues.
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  tableName(className: string, customName?: string): string {
    return customName || snakeCase(className);
  }

  columnName(propertyName: string, customName: string, embeddedPrefixes: string[]): string {
    return snakeCase(embeddedPrefixes.join('_')) + (customName ? customName : snakeCase(propertyName));
  }

  relationName(propertyName: string): string {
    return snakeCase(propertyName);
  }
}
