import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

export class YamlReader {
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
