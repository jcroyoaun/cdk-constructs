import { YamlReader } from '../../lib/utils/yaml-reader';

jest.mock('fs');
jest.mock('path');

describe('YamlReader', () => {
  test('readValue reads YAML file correctly', () => {
    const mockFileContents = `
    key1: value1
    key2:
      nestedKey: nestedValue
    `;
    require('fs').readFileSync.mockReturnValue(mockFileContents);

    const result = YamlReader.readValue('test');

    expect(result).toEqual({
      key1: 'value1',
      key2: {
        nestedKey: 'nestedValue',
      },
    });
  });
});
