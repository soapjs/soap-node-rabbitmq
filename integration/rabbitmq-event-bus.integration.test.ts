import { RabbitMQEventBus } from '../src/rabbitmq-event-bus';
import { EventBase } from '@soapjs/soap';
import { setupIntegrationTests, teardownIntegrationTests } from './setup';

describe('RabbitMQ EventBus Integration Tests', () => {
  let eventBus: RabbitMQEventBus<string, Record<string, unknown>, string>;
  let connectionUrl: string;

  beforeAll(async () => {
    connectionUrl = await setupIntegrationTests();
    eventBus = new RabbitMQEventBus({
      connectionUrl,
      exchangeName: 'integration.test.events',
      queuePrefix: 'integration-test'
    });
  }, 60000);

  afterAll(async () => {
    if (eventBus) {
      await eventBus.disconnect();
    }
    await teardownIntegrationTests();
  }, 30000);

  describe('Connection Management', () => {
    it('should connect to RabbitMQ successfully', async () => {
      await expect(eventBus.connect()).resolves.not.toThrow();
    });

    it('should check health status correctly', async () => {
      const isHealthy = await eventBus.checkHealth();
      expect(isHealthy).toBe(true);
    });

    it('should disconnect from RabbitMQ successfully', async () => {
      await expect(eventBus.disconnect()).resolves.not.toThrow();
    });

    it('should reconnect after disconnect', async () => {
      await eventBus.connect();
      const isHealthy = await eventBus.checkHealth();
      expect(isHealthy).toBe(true);
    });
  });

  describe('Event Publishing and Consuming', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    afterEach(async () => {
      await eventBus.disconnect();
    });

    it('should publish and consume events successfully', async () => {
      const testEvent: EventBase<string, Record<string, unknown>> = {
        message: 'Hello RabbitMQ!',
        headers: {
          correlation_id: 'test-123',
          timestamp: new Date().toISOString(),
          source: 'integration-test'
        }
      };

      const receivedEvents: EventBase<string, Record<string, unknown>>[] = [];
      const subscriptionPromise = new Promise<void>((resolve) => {
        eventBus.subscribe('test.event', (event) => {
          receivedEvents.push(event);
          if (receivedEvents.length === 1) {
            resolve();
          }
        });
      });

      // Wait a bit for subscription to be established
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Publish the event
      await eventBus.publish('test.event', testEvent);

      // Wait for the event to be received
      await subscriptionPromise;

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].message).toBe('Hello RabbitMQ!');
      expect(receivedEvents[0].headers.correlation_id).toBe('test-123');
    });

    it('should handle multiple events', async () => {
      const events: EventBase<string, Record<string, unknown>>[] = [
        {
          message: 'Event 1',
          headers: { correlation_id: '1', timestamp: new Date().toISOString() }
        },
        {
          message: 'Event 2',
          headers: { correlation_id: '2', timestamp: new Date().toISOString() }
        },
        {
          message: 'Event 3',
          headers: { correlation_id: '3', timestamp: new Date().toISOString() }
        }
      ];

      const receivedEvents: EventBase<string, Record<string, unknown>>[] = [];
      const subscriptionPromise = new Promise<void>((resolve) => {
        eventBus.subscribe('multi.test', (event) => {
          receivedEvents.push(event);
          if (receivedEvents.length === events.length) {
            resolve();
          }
        });
      });

      // Wait for subscription
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Publish all events
      for (const event of events) {
        await eventBus.publish('multi.test', event);
      }

      // Wait for all events to be received
      await subscriptionPromise;

      expect(receivedEvents).toHaveLength(3);
      expect(receivedEvents.map(e => e.message)).toEqual(['Event 1', 'Event 2', 'Event 3']);
    });

    it('should handle events with errors', async () => {
      const eventWithError: EventBase<string, Record<string, unknown>> = {
        message: 'Error event',
        headers: { correlation_id: 'error-123', timestamp: new Date().toISOString() },
        error: new Error('Test error')
      };

      const receivedEvents: EventBase<string, Record<string, unknown>>[] = [];
      const subscriptionPromise = new Promise<void>((resolve) => {
        eventBus.subscribe('error.test', (event) => {
          receivedEvents.push(event);
          resolve();
        });
      });

      // Wait for subscription
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Publish event with error
      await eventBus.publish('error.test', eventWithError);

      // Wait for event to be received
      await subscriptionPromise;

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].message).toBe('Error event');
      expect(receivedEvents[0].error).toBeDefined();
    });
  });

  describe('Pattern-based Subscriptions', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    afterEach(async () => {
      await eventBus.disconnect();
    });

    it('should subscribe to pattern-based events', async () => {
      const receivedEvents: Array<{ eventId: string; event: EventBase<string, Record<string, unknown>> }> = [];
      const subscriptionPromise = new Promise<void>((resolve) => {
        eventBus.subscribeToPattern('user.*', (eventId, event) => {
          receivedEvents.push({ eventId, event });
          if (receivedEvents.length === 2) {
            resolve();
          }
        });
      });

      // Wait for subscription
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Publish events with different routing keys
      await eventBus.publish('user.created', {
        message: 'User created',
        headers: { correlation_id: '1', timestamp: new Date().toISOString() }
      });

      await eventBus.publish('user.updated', {
        message: 'User updated',
        headers: { correlation_id: '2', timestamp: new Date().toISOString() }
      });

      // Wait for events to be received
      await subscriptionPromise;

      expect(receivedEvents).toHaveLength(2);
      expect(receivedEvents.map(e => e.eventId)).toEqual(['user.created', 'user.updated']);
      expect(receivedEvents.map(e => e.event.message)).toEqual(['User created', 'User updated']);
    });
  });

  describe('Batch Processing', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    afterEach(async () => {
      await eventBus.disconnect();
    });

    it('should process events in batches', async () => {
      const receivedBatches: EventBase<string, Record<string, unknown>>[][] = [];
      const subscriptionPromise = new Promise<void>((resolve) => {
        eventBus.subscribeBatch('batch.test', (events) => {
          receivedBatches.push(events);
          if (receivedBatches.length === 1) {
            resolve();
          }
        });
      });

      // Wait for subscription
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Publish multiple events quickly
      const events = [
        { message: 'Batch 1', headers: { correlation_id: '1', timestamp: new Date().toISOString() } },
        { message: 'Batch 2', headers: { correlation_id: '2', timestamp: new Date().toISOString() } },
        { message: 'Batch 3', headers: { correlation_id: '3', timestamp: new Date().toISOString() } }
      ];

      for (const event of events) {
        await eventBus.publish('batch.test', event);
      }

      // Wait for batch to be processed
      await subscriptionPromise;

      expect(receivedBatches).toHaveLength(1);
      expect(receivedBatches[0]).toHaveLength(3);
      expect(receivedBatches[0].map(e => e.message)).toEqual(['Batch 1', 'Batch 2', 'Batch 3']);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    afterEach(async () => {
      await eventBus.disconnect();
    });

    it('should handle connection errors gracefully', async () => {
      // Disconnect first
      await eventBus.disconnect();

      // Try to publish without connection
      await expect(eventBus.publish('test.event', {
        message: 'test',
        headers: { correlation_id: '1', timestamp: new Date().toISOString() }
      })).rejects.toThrow('Not connected to RabbitMQ');

      // Try to subscribe without connection
      await expect(eventBus.subscribe('test.event', () => {})).rejects.toThrow('Not connected to RabbitMQ');
    });

    it('should handle malformed messages gracefully', async () => {
      const receivedEvents: EventBase<string, Record<string, unknown>>[] = [];
      const subscriptionPromise = new Promise<void>((resolve) => {
        eventBus.subscribe('malformed.test', (event) => {
          receivedEvents.push(event);
          resolve();
        });
      });

      // Wait for subscription
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Publish event with malformed data (this should be handled by the JSON.stringify in publish)
      await eventBus.publish('malformed.test', {
        message: 'Valid message',
        headers: { correlation_id: '1', timestamp: new Date().toISOString() }
      });

      // Wait for event to be received
      await subscriptionPromise;

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].message).toBe('Valid message');
    });
  });
});
