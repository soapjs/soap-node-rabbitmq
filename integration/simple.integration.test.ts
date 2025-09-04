import { setupIntegrationTests, teardownIntegrationTests } from './setup';
import { RabbitMQEventBus } from '../src/rabbitmq-event-bus';

describe('Simple Integration Test', () => {
  let connectionUrl: string;
  let eventBus: RabbitMQEventBus<string, Record<string, unknown>, string>;

  beforeAll(async () => {
    connectionUrl = await setupIntegrationTests();
    eventBus = new RabbitMQEventBus({
      connectionUrl,
      exchangeName: 'simple.test.events',
      queuePrefix: 'simple-test'
    });
  }, 60000);

  afterAll(async () => {
    if (eventBus) {
      await eventBus.disconnect();
    }
    await teardownIntegrationTests();
  }, 30000);

  it('should connect to RabbitMQ', async () => {
    await eventBus.connect();
    const isHealthy = await eventBus.checkHealth();
    expect(isHealthy).toBe(true);
  });

  it('should publish and consume a simple event', async () => {
    await eventBus.connect();

    const testMessage = 'Hello RabbitMQ!';
    const receivedMessages: string[] = [];

    // Set up consumer
    await eventBus.subscribe('simple.test', (event) => {
      receivedMessages.push(event.message);
    });

    // Wait for subscription to be established
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Publish event
    await eventBus.publish('simple.test', {
      message: testMessage,
      headers: { correlation_id: 'test-123', timestamp: new Date().toISOString() }
    });

    // Wait for message to be received
    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]).toBe(testMessage);
  });
});
