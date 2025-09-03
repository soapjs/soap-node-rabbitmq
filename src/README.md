# RabbitMQ Event System for SoapJS

This package provides a RabbitMQ-based implementation of the SoapJS event system interfaces.

## Features

- **RabbitMQEventBus**: Publish and subscribe to events using RabbitMQ
- **Integration with SoapJS**: Works seamlessly with EventDispatcher and EventProcessor from @soapjs/soap
- **Pattern-based Subscriptions**: Subscribe to events using routing patterns
- **Batch Processing**: Process multiple events in batches
- **Comprehensive Error Handling**: Built-in retry logic and error recovery
- **Health Monitoring**: Connection health checks and monitoring

## Installation

```bash
npm install @soapjs/soap-node-rabbitmq
```

## Quick Start

```typescript
import { RabbitMQEventBus, EventProcessor, EventDispatcher } from '@soapjs/soap-node-rabbitmq';

// Create the event system components
const eventBus = new RabbitMQEventBus({
  connectionUrl: 'amqp://localhost:5672',
  exchangeName: 'my.events',
  queuePrefix: 'my-service'
});

const dispatcher = new EventDispatcher(eventBus, {
  maxRetries: 3,
  retryDelay: 1000,
  callbacks: {
    onSuccess: (event) => console.log('Event dispatched successfully'),
    onError: (error, event) => console.error('Dispatch failed:', error)
  }
});

const processor = new EventProcessor(eventBus, {
  retries: 3,
  maxParallelism: 5,
  callbacks: {
    onSuccess: (event) => console.log('Event processed successfully'),
    onError: (error, event) => console.error('Processing failed:', error)
  }
});

// Connect to RabbitMQ
await eventBus.connect();

// Set up event processing
processor.addHandler('user.created', async (payload) => {
  console.log('User created:', payload);
});
await processor.start();

// Dispatch events
await dispatcher.dispatch({
  id: 'user-123',
  type: 'user.created',
  data: { userId: '123', name: 'John Doe' },
  correlationId: 'corr-123',
  source: 'user-service',
  timestamp: new Date()
});

// Clean up
await processor.shutdown();
await eventBus.disconnect();
```

## API Reference

### RabbitMQEventBus

The main event bus implementation that handles RabbitMQ connections and message routing.

```typescript
import { RabbitMQEventBus } from '@soapjs/soap-node-rabbitmq';

const eventBus = new RabbitMQEventBus({
  connectionUrl: 'amqp://localhost:5672',
  exchangeName: 'my.events',
  queuePrefix: 'my-service'
});
```

#### Methods

- `connect()`: Connect to RabbitMQ
- `disconnect()`: Disconnect from RabbitMQ
- `checkHealth()`: Check if the connection is healthy
- `publish(event, eventData)`: Publish an event
- `subscribe(event, handler)`: Subscribe to an event
- `unsubscribe(subscriptionId)`: Unsubscribe from an event
- `subscribeToPattern(pattern, handler)`: Subscribe to events matching a pattern
- `subscribeBatch(event, handler)`: Subscribe to batch events
- `acknowledge(messageId)`: Acknowledge a message (no-op in this implementation)
- `reject(messageId, requeue)`: Reject a message (no-op in this implementation)

### EventDispatcher (from @soapjs/soap)

Handles event dispatching with retry logic and error handling.

```typescript
import { EventDispatcher } from '@soapjs/soap-node-rabbitmq';

const dispatcher = new EventDispatcher(eventBus, {
  maxRetries: 3,
  retryDelay: 1000,
  exponentialBackoff: true,
  callbacks: {
    onSuccess: (event) => console.log('Event dispatched'),
    onError: (error, event) => console.error('Dispatch failed'),
    onRetry: (event, attempt, error) => console.log(`Retrying event (attempt ${attempt})`)
  }
});
```

### EventProcessor (from @soapjs/soap)

Processes events with configurable parallelism and retry policies.

```typescript
import { EventProcessor } from '@soapjs/soap-node-rabbitmq';

const processor = new EventProcessor(eventBus, {
  retries: 3,
  maxParallelism: 5,
  callbacks: {
    onSuccess: (event) => console.log('Event processed successfully'),
    onError: (error, event) => console.error('Processing failed'),
    onClose: () => console.log('Processor closed')
  }
});
```

## Configuration Options

### RabbitMQEventBusOptions

```typescript
interface RabbitMQEventBusOptions {
  connectionUrl: string;           // RabbitMQ connection URL
  exchangeName?: string;          // Exchange name (default: 'soap.events')
  queuePrefix?: string;           // Queue name prefix (default: 'soap')
  retryPolicy?: {                 // Retry policy for failed operations
    maxRetries: number;
    delay: number;
    backoff?: BackoffOptions;
  };
}
```

### EventDispatcherOptions

```typescript
interface EventDispatcherOptions {
  maxRetries?: number;            // Maximum retry attempts
  retryDelay?: number;            // Delay between retries (ms)
  exponentialBackoff?: boolean;   // Use exponential backoff
  callbacks?: {                   // Event callbacks
    onSuccess?: (event, payload) => void;
    onError?: (event, error, payload) => void;
    onRetry?: (event, attempt, error) => void;
  };
}
```

### EventProcessorOptions

```typescript
interface EventProcessorOptions {
  retries?: number;               // Number of retries for failed events
  dlq?: {                        // Dead letter queue configuration
    enabled: boolean;
    topic: string;
  };
  maxParallelism?: number;        // Maximum concurrent event processing
  callbacks?: {                  // Event callbacks
    onError?: (error, event) => void;
    onSuccess?: (event) => void;
    onClose?: () => void;
  };
}
```

## Error Handling

The event system includes comprehensive error handling:

- **Connection Errors**: Automatic reconnection with exponential backoff
- **Message Processing Errors**: Configurable retry policies and dead letter queues
- **Health Checks**: Built-in health monitoring for connection status

## Advanced Usage

### Pattern-based Subscriptions

```typescript
// Subscribe to all user events
await eventBus.subscribeToPattern('user.*', (eventId, eventData) => {
  console.log(`Received ${eventId}:`, eventData);
});
```

### Batch Processing

```typescript
// Process events in batches
await eventBus.subscribeBatch('user.events', (events) => {
  console.log(`Processing ${events.length} events in batch`);
  events.forEach(event => {
    // Process each event
  });
});
```

### Health Monitoring

```typescript
// Check connection health
const isHealthy = await eventBus.checkHealth();
if (!isHealthy) {
  console.log('Connection is unhealthy, attempting to reconnect...');
  await eventBus.connect();
}
```

## Examples

See the `examples/` directory for complete usage examples including:

- Basic event publishing and consuming
- Pattern-based subscriptions
- Batch event processing
- Error handling and retry logic
- Health monitoring
- Integration with EventDispatcher and EventProcessor

## Testing

Run the test suite:

```bash
# Unit tests
npm run test:unit

# Integration tests (requires Docker)
npm run test:integration

# All tests
npm test
```

### Test Coverage

The package includes comprehensive test coverage:
- **Unit Tests**: 82.6% code coverage
- **Integration Tests**: Full end-to-end scenarios with real RabbitMQ
- **Error Scenarios**: Connection failures, malformed messages, retry logic

## License

MIT
