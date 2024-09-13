import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

interface YamlData {
  [key: string]: any;
}

export class YamlReader {
  static readValue(env: string): YamlData {
    try {
      const fullPath = path.resolve(__dirname, '..', '..', 'config', `${env}.yaml`);
      console.log(`Attempting to read YAML file from: ${fullPath}`);
      
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      const data = yaml.load(fileContents) as YamlData;
      
      console.log('Loaded YAML file successfully');
      console.log('CloudFormation Stack will be Synthesized with this data:');
      this.logYamlData(data);
      
      return data;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error reading YAML file: ${error.message}`);
      } else {
        console.error('An unknown error occurred while reading the YAML file');
      }
      throw error;
    }
  }

  private static logYamlData(data: YamlData, indent: string = ''): void {
    Object.entries(data).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        console.log(`${indent}${key}:`);
        this.logYamlData(value, indent + '  ');
      } else {
        console.log(`${indent}${key}: ${value}`);
      }
    });
  }
}