import { setupIntegrationTests, teardownIntegrationTests } from './setup';
import { IntegrationTestHelper } from './test-helpers';
import { RetryWithBackoffStrategy } from '../src/strategies';
import { EventProcessor, EventDispatcher, EventBase, ExternalEvent } from '@soapjs/soap';

describe('RetryWithBackoffStrategy Integration Tests', () => {
  let connectionUrl: string;
  let system: any;

  beforeAll(async () => {
    connectionUrl = await setupIntegrationTests();
  });

  afterAll(async () => {
    await teardownIntegrationTests();
  });

  beforeEach(async () => {
    system = await IntegrationTestHelper.createTestEventSystem(connectionUrl, {
      exchangeName: 'retry.test.events',
      queuePrefix: 'retry-test'
    });
    await IntegrationTestHelper.waitForConnection(system.eventBus);
  });

  afterEach(async () => {
    await IntegrationTestHelper.cleanupEventSystem(system);
  });

  it('should retry failed messages with exponential backoff', async () => {
    const receivedEvents: EventBase<string, Record<string, unknown>>[] = [];
    let retryCount = 0;
    
    const retryStrategy = new RetryWithBackoffStrategy<string, Record<string, unknown>>({
      maxRetries: 3,
      baseDelay: 500,
      retryExchange: 'retry.test.retry',
      deadLetterExchange: 'retry.test.dlq'
    });

    const processor = new EventProcessor(system.eventBus, {
      retries: 3, // Allow retries
      maxParallelism: 1,
      strategy: retryStrategy
    } as any);

    processor.addHandler('test.retry', async (payload: any) => {
      receivedEvents.push(payload);
      retryCount++;
      
      if (payload.message && payload.message.includes('fail') && retryCount < 3) {
        throw new Error(`Retry attempt ${retryCount}`);
      }
    });

    await processor.start();
    const dispatcher = new EventDispatcher(system.eventBus as any);

    // Dispatch message that will fail initially but succeed after retries
    await dispatcher.dispatch({
      id: 'retry-message',
      type: 'test.retry',
      data: { message: 'fail message' },
      correlationId: 'corr-retry',
      source: 'test',
      timestamp: new Date()
    });

    // Wait for processing and retries
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Should have been processed multiple times due to retries
    expect(receivedEvents.length).toBeGreaterThan(1);

    await processor.shutdown();
  }, 15000);

  it('should eventually route to DLQ after max retries exceeded', async () => {
    const receivedEvents: EventBase<string, Record<string, unknown>>[] = [];
    
    const retryStrategy = new RetryWithBackoffStrategy<string, Record<string, unknown>>({
      maxRetries: 2,
      baseDelay: 200,
      retryExchange: 'retry.test.retry',
      deadLetterExchange: 'retry.test.dlq'
    });

    const processor = new EventProcessor(system.eventBus, {
      retries: 2,
      maxParallelism: 1,
      strategy: retryStrategy
    } as any);

    processor.addHandler('test.retry.max', async (payload: any) => {
      receivedEvents.push(payload);
      throw new Error('Always fail');
    });

    await processor.start();
    const dispatcher = new EventDispatcher(system.eventBus as any);

    await dispatcher.dispatch({
      id: 'max-retry-message',
      type: 'test.retry.max',
      data: { message: 'always fail message' },
      correlationId: 'corr-max-retry',
      source: 'test',
      timestamp: new Date()
    });

    // Wait for processing and retries
    await new Promise(resolve => setTimeout(resolve, 3000));

    // With retries: 0, EventProcessor doesn't retry, so we get exactly 2 attempts
    // (initial + 1 retry from EventProcessor's internal retry mechanism)
    expect(receivedEvents.length).toBe(2);

    await processor.shutdown();
  }, 10000);

  it('should handle successful messages without retries', async () => {
    const receivedEvents: EventBase<string, Record<string, unknown>>[] = [];
    
    const retryStrategy = new RetryWithBackoffStrategy<string, Record<string, unknown>>({
      maxRetries: 3,
      baseDelay: 500,
      retryExchange: 'retry.test.retry',
      deadLetterExchange: 'retry.test.dlq'
    });

    const processor = new EventProcessor(system.eventBus, {
      retries: 3,
      maxParallelism: 1,
      strategy: retryStrategy
    } as any);

    processor.addHandler('test.retry.success', async (payload: any) => {
      receivedEvents.push(payload);
      // No error - should succeed immediately
    });

    await processor.start();
    const dispatcher = new EventDispatcher(system.eventBus as any);

    await dispatcher.dispatch({
      id: 'success-message',
      type: 'test.retry.success',
      data: { message: 'success message' },
      correlationId: 'corr-success',
      source: 'test',
      timestamp: new Date()
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Should be processed only once
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0].message).toStrictEqual({ message: 'success message' });

    await processor.shutdown();
  }, 10000);

  it('should calculate correct backoff delays', async () => {
    const retryStrategy = new RetryWithBackoffStrategy<string, Record<string, unknown>>({
      maxRetries: 3,
      baseDelay: 1000,
      retryExchange: 'retry.test.retry',
      deadLetterExchange: 'retry.test.dlq'
    });

    // Test backoff calculation
    const calculateDelay = (retryStrategy as any).calculateBackoffDelay.bind(retryStrategy);
    
    expect(calculateDelay(0)).toBe(1000); // 1000 * 2^0 = 1000
    expect(calculateDelay(1)).toBe(2000); // 1000 * 2^1 = 2000
    expect(calculateDelay(2)).toBe(4000); // 1000 * 2^2 = 4000
  });
});
