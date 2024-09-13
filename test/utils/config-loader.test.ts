import { ConfigProvider } from '../../lib/utils/yaml-reader';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

jest.mock('fs');
jest.mock('js-yaml');

describe('ConfigProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (ConfigProvider as any).instance = undefined;
  });

  test('getInstance creates a new instance when called for the first time', () => {
    const mockConfig = { test: 'config' };
    (fs.readFileSync as jest.Mock).mockReturnValue('');
    (yaml.load as jest.Mock).mockReturnValue(mockConfig);

    const instance = ConfigProvider.getInstance('dev');
    expect(instance).toBeInstanceOf(ConfigProvider);
    expect(instance.getConfig()).toEqual(mockConfig);
  });

  test('getInstance returns the same instance on subsequent calls', () => {
    const mockConfig = { test: 'config' };
    (fs.readFileSync as jest.Mock).mockReturnValue('');
    (yaml.load as jest.Mock).mockReturnValue(mockConfig);

    const instance1 = ConfigProvider.getInstance('dev');
    const instance2 = ConfigProvider.getInstance();

    expect(instance1).toBe(instance2);
  });

  test('getInstance throws an error when called without environment and no instance exists', () => {
    expect(() => ConfigProvider.getInstance()).toThrow('Environment must be provided when initializing ConfigProvider');
  });
});
