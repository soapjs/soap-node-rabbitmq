import { RabbitMQEventBus } from '../src/rabbitmq-event-bus';
import { EventProcessor } from '@soapjs/soap';
import { setupIntegrationTests, teardownIntegrationTests } from './setup';

describe('RabbitMQ EventProcessor Simple Integration Tests', () => {
  let connectionUrl: string;
  let eventBus: any;
  let processor: any;

  beforeAll(async () => {
    connectionUrl = await setupIntegrationTests();
    
    eventBus = new RabbitMQEventBus<string, Record<string, unknown>>({
      connectionUrl,
      exchangeName: 'processor-simple.test.events',
      queuePrefix: 'processor-simple-test'
    });
    
    processor = new EventProcessor(eventBus, {
      retries: 1,
      maxParallelism: 1,
      callbacks: {
        onSuccess: jest.fn(),
        onError: jest.fn()
      }
    });
  }, 60000);

  afterAll(async () => {
    if (processor) {
      await processor.shutdown();
    }
    if (eventBus) {
      await eventBus.disconnect();
    }
    await teardownIntegrationTests();
  }, 30000);

  describe('Simple Event Processing', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    afterEach(async () => {
      await processor.shutdown();
      await eventBus.disconnect();
    });

    it('should process a simple event successfully', async () => {
      const processedEvents: any[] = [];
      
      // Add handler and start processor
      processor.addHandler('processor-simple.test', async (payload: any) => {
        processedEvents.push(payload);
      });
      await processor.start();

      // Wait for processor to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Publish event
      await eventBus.publish('processor-simple.test', {
        message: 'Simple test message',
        headers: { correlation_id: 'simple-test', timestamp: new Date().toISOString() }
      });

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(processedEvents).toHaveLength(1);
      expect(processedEvents[0]).toEqual(
        expect.objectContaining({
          message: 'Simple test message',
          headers: expect.objectContaining({ correlation_id: 'simple-test' })
        })
      );
    });

    it('should handle processing errors', async () => {
      const onErrorCallback = jest.fn();
      
      const customProcessor = new EventProcessor(eventBus, {
        retries: 1,
        maxParallelism: 1,
        callbacks: {
          onError: onErrorCallback
        }
      });

      customProcessor.addHandler('processor-error.test', async (payload: any) => {
        throw new Error('Simulated processing error');
      });
      await customProcessor.start();

      // Wait for processor to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Publish event that will fail
      await eventBus.publish('processor-error.test', {
        message: 'Error test message',
        headers: { correlation_id: 'error-test', timestamp: new Date().toISOString() }
      });

      // Wait for error handling to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(onErrorCallback).toHaveBeenCalled();

      await customProcessor.shutdown();
    });
  });
});
