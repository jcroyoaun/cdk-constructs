import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

class YamlReader {
  static readValue(env: string): any {
    try {
      const fullPath = path.resolve(__dirname, '..', '..', 'config', `${env}.yaml`);
      console.log(`Attempting to read YAML file from: ${fullPath}`);
      
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      const data = yaml.load(fileContents) as any;
      return data;
    } catch (error) {
      console.error(`Error reading YAML file: ${error}`);
      throw error;
    }
  }
}

export class ConfigProvider {
  private static instance: ConfigProvider;
  private config: any;

  private constructor(env: string) {
    this.config = YamlReader.readValue(env);
  }

  static getInstance(env?: string): ConfigProvider {
    if (!ConfigProvider.instance) {
      if (!env) {
        throw new Error('Environment must be provided when initializing ConfigProvider');
      }
      ConfigProvider.instance = new ConfigProvider(env);
    }
    return ConfigProvider.instance;
  }

  getConfig(): any {
    return this.config;
  }

  getAwsRegion(): string {
    return this.config.aws_region;
  }
}
