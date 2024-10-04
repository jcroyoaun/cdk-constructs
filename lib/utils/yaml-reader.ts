import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { logger } from './logger';

interface YamlData {
  [key: string]: any;
}

export class YamlReader {
  static readValue(env: string): YamlData {
    try {
      const fullPath = path.resolve(__dirname, '..', '..', 'config', `${env}.yaml`);
      logger.info(`Attempting to read YAML file from: ${fullPath}`, 'YamlReader');
      
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      const data = yaml.load(fileContents) as YamlData;
      
      logger.success('Loaded YAML file successfully', 'YamlReader');
      logger.info(`The environment ${env} will be deployed using this data:`, 'YamlReader');
      logger.logObject(data, 'YamlReader');
      
      return data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  private static handleError(error: unknown): void {
    if (error instanceof Error) {
      logger.error(`Error reading YAML file: ${error.message}`, 'YamlReader');
    } else {
      logger.error('An unknown error occurred while reading the YAML file', 'YamlReader');
    }
  }
}