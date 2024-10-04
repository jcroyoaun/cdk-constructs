import { Logger } from '../../lib/utils/logger';

describe('Logger', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('info logs message with correct format', () => {
    const logger = Logger.getInstance();
    logger.info('Test message', 'TestContext');

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test message'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[TestContext]'));
  });
});
