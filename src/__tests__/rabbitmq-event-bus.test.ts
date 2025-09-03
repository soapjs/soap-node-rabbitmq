import { RabbitMQEventBus } from '../rabbitmq-event-bus';
import { EventBase } from '@soapjs/soap';

// Mock amqplib
jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

describe('RabbitMQEventBus', () => {
  let eventBus: RabbitMQEventBus<string, Record<string, unknown>, string>;
  let mockConnection: any;
  let mockChannel: any;

  beforeEach(() => {
    mockChannel = {
      assertExchange: jest.fn(),
      assertQueue: jest.fn(),
      bindQueue: jest.fn(),
      consume: jest.fn(),
      publish: jest.fn(),
      ack: jest.fn(),
      nack: jest.fn(),
      deleteQueue: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn(),
      on: jest.fn(),
    };

    const amqp = require('amqplib');
    amqp.connect.mockResolvedValue(mockConnection);

    eventBus = new RabbitMQEventBus({
      connectionUrl: 'amqp://localhost',
      exchangeName: 'test.events',
      queuePrefix: 'test'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('should connect to RabbitMQ and set up exchange', async () => {
      await eventBus.connect();

      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'test.events',
        'topic',
        { durable: true }
      );
    });

    it('should throw error if connection fails', async () => {
      const amqp = require('amqplib');
      amqp.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(eventBus.connect()).rejects.toThrow('Failed to connect to RabbitMQ');
    });
  });

  describe('disconnect', () => {
    it('should close channel and connection', async () => {
      await eventBus.connect();
      await eventBus.disconnect();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });
  });

  describe('checkHealth', () => {
    it('should return true when connection is healthy', async () => {
      await eventBus.connect();
      mockChannel.assertQueue.mockResolvedValue({ queue: 'temp-queue' });
      mockChannel.deleteQueue.mockResolvedValue(undefined);

      const isHealthy = await eventBus.checkHealth();

      expect(isHealthy).toBe(true);
    });

    it('should return false when not connected', async () => {
      const isHealthy = await eventBus.checkHealth();
      expect(isHealthy).toBe(false);
    });
  });

  describe('publish', () => {
    it('should publish event to RabbitMQ', async () => {
      await eventBus.connect();
      mockChannel.publish.mockReturnValue(true);

      const eventData: EventBase<string, Record<string, unknown>> = {
        message: 'test message',
        headers: { correlation_id: '123', timestamp: '2023-01-01' }
      };

      await eventBus.publish('test.event', eventData);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test.events',
        'test.event',
        expect.any(Buffer),
        expect.objectContaining({
          persistent: true,
          messageId: expect.any(String),
          timestamp: expect.any(Number),
          headers: eventData.headers
        })
      );
    });

    it('should throw error if not connected', async () => {
      const eventData: EventBase<string, Record<string, unknown>> = {
        message: 'test message',
        headers: {}
      };

      await expect(eventBus.publish('test.event', eventData))
        .rejects.toThrow('Not connected to RabbitMQ');
    });
  });

  describe('subscribe', () => {
    it('should subscribe to event and set up consumer', async () => {
      await eventBus.connect();
      mockChannel.assertQueue.mockResolvedValue({ queue: 'test-queue' });
      mockChannel.bindQueue.mockResolvedValue(undefined);
      mockChannel.consume.mockResolvedValue(undefined);

      const handler = jest.fn();
      await eventBus.subscribe('test.event', handler);

      expect(mockChannel.assertQueue).toHaveBeenCalled();
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'test-queue',
        'test.events',
        'test.event'
      );
      expect(mockChannel.consume).toHaveBeenCalled();
    });
  });

  describe('setRetryPolicy', () => {
    it('should set retry policy', () => {
      const backoffOptions = {
        type: 'exponential' as const,
        multiplier: 2,
        maxDelay: 30000,
        jitter: true
      };

      eventBus.setRetryPolicy(5, 2000, backoffOptions);

      // We can't directly test the private property, but we can test that it doesn't throw
      expect(() => eventBus.setRetryPolicy(5, 2000, backoffOptions)).not.toThrow();
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from event', async () => {
      await eventBus.connect();
      mockChannel.assertQueue.mockResolvedValue({ queue: 'test-queue' });
      mockChannel.bindQueue.mockResolvedValue(undefined);
      mockChannel.consume.mockResolvedValue(undefined);
      mockChannel.deleteQueue.mockResolvedValue(undefined);

      // First subscribe to create a subscription
      await eventBus.subscribe('test.event', jest.fn());
      
      // Test that unsubscribe doesn't throw when called with valid subscription
      await expect(eventBus.unsubscribe('test-subscription')).resolves.not.toThrow();
    });

    it('should handle unsubscribe when not connected', async () => {
      await expect(eventBus.unsubscribe('test-subscription')).resolves.not.toThrow();
    });
  });

  describe('acknowledge', () => {
    it('should acknowledge message', async () => {
      await eventBus.connect();
      
      // acknowledge is a no-op in our implementation, but we test it doesn't throw
      await expect(eventBus.acknowledge('test-message-id')).resolves.not.toThrow();
    });
  });

  describe('reject', () => {
    it('should reject message', async () => {
      await eventBus.connect();
      
      // reject is a no-op in our implementation, but we test it doesn't throw
      await expect(eventBus.reject('test-message-id', false)).resolves.not.toThrow();
      await expect(eventBus.reject('test-message-id', true)).resolves.not.toThrow();
    });
  });

  describe('subscribeToPattern', () => {
    it('should subscribe to pattern', async () => {
      await eventBus.connect();
      mockChannel.assertQueue.mockResolvedValue({ queue: 'pattern-queue' });
      mockChannel.bindQueue.mockResolvedValue(undefined);
      mockChannel.consume.mockResolvedValue(undefined);

      const handler = jest.fn();
      const subscriptionId = await eventBus.subscribeToPattern('test.*', handler);

      expect(mockChannel.assertQueue).toHaveBeenCalled();
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'pattern-queue',
        'test.events',
        'test.*'
      );
      expect(mockChannel.consume).toHaveBeenCalled();
      expect(subscriptionId).toBeDefined();
    });

    it('should throw error if not connected', async () => {
      const handler = jest.fn();
      await expect(eventBus.subscribeToPattern('test.*', handler))
        .rejects.toThrow('Not connected to RabbitMQ');
    });
  });

  describe('subscribeBatch', () => {
    it('should subscribe to batch events', async () => {
      await eventBus.connect();
      mockChannel.assertQueue.mockResolvedValue({ queue: 'batch-queue' });
      mockChannel.bindQueue.mockResolvedValue(undefined);
      mockChannel.consume.mockResolvedValue(undefined);

      const handler = jest.fn();
      const subscriptionId = await eventBus.subscribeBatch('test.event', handler);

      expect(mockChannel.assertQueue).toHaveBeenCalled();
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'batch-queue',
        'test.events',
        'test.event'
      );
      expect(mockChannel.consume).toHaveBeenCalled();
      expect(subscriptionId).toBeDefined();
    });

    it('should throw error if not connected', async () => {
      const handler = jest.fn();
      await expect(eventBus.subscribeBatch('test.event', handler))
        .rejects.toThrow('Not connected to RabbitMQ');
    });
  });

  describe('publish error handling', () => {
    it('should throw error when channel buffer is full', async () => {
      await eventBus.connect();
      mockChannel.publish.mockReturnValue(false); // Buffer full

      const eventData: EventBase<string, Record<string, unknown>> = {
        message: 'test message',
        headers: { correlation_id: '123' }
      };

      await expect(eventBus.publish('test.event', eventData))
        .rejects.toThrow('Failed to publish message - channel buffer is full');
    });
  });

  describe('subscribe error handling', () => {
    it('should handle JSON parsing errors in consume callback', async () => {
      await eventBus.connect();
      mockChannel.assertQueue.mockResolvedValue({ queue: 'test-queue' });
      mockChannel.bindQueue.mockResolvedValue(undefined);
      
      let consumeCallback: any;
      mockChannel.consume.mockImplementation((queue, callback) => {
        consumeCallback = callback;
        return Promise.resolve();
      });

      const handler = jest.fn();
      await eventBus.subscribe('test.event', handler);

      // Simulate malformed message
      const malformedMessage = {
        content: Buffer.from('invalid json'),
        fields: { routingKey: 'test.event' }
      };

      // Mock console.error to avoid noise in test output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const nackSpy = jest.spyOn(mockChannel, 'nack');

      consumeCallback(malformedMessage);

      expect(consoleSpy).toHaveBeenCalledWith('Error processing message:', expect.any(Error));
      expect(nackSpy).toHaveBeenCalledWith(malformedMessage, false, false);

      consoleSpy.mockRestore();
    });
  });
});
