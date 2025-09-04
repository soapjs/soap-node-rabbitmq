# RabbitMQ Processing Strategies

This document describes the RabbitMQ-specific processing strategies available in the `@soapjs/soap-node-rabbitmq` package. These strategies leverage RabbitMQ's advanced features to provide robust message processing capabilities. We encourage you to write your own custom strategies tailored to your specific needs - the provided strategies cover basic common scenarios, but you can extend the base `RabbitMQProcessingStrategy` class to implement more sophisticated behaviors.



## Overview

The package provides several specialized processing strategies that extend the default SOAP framework behavior with RabbitMQ-specific features:

- **DeadLetterQueueStrategy** - Routes failed messages to dead letter exchanges
- **RetryWithBackoffStrategy** - Implements exponential backoff retry logic
- **BatchProcessingStrategy** - Processes messages in batches for better throughput
- **PriorityQueueStrategy** - Handles messages based on priority levels
- **TTLStrategy** - Automatically expires old messages
- **CircuitBreakerStrategy** - Implements circuit breaker pattern for fault tolerance

## Quick Start

```typescript
import { 
  RabbitMQEventBus, 
  DeadLetterQueueStrategy,
  RetryWithBackoffStrategy,
  BatchProcessingStrategy,
  PriorityQueueStrategy,
  TTLStrategy,
  CircuitBreakerStrategy
} from '@soapjs/soap-node-rabbitmq';
import { EventProcessor } from '@soapjs/soap';

// Create event bus
const eventBus = new RabbitMQEventBus({
  connectionUrl: 'amqp://localhost:5672',
  exchangeName: 'my.events',
  queuePrefix: 'my-service'
});

// Create a retry strategy with exponential backoff
const strategy = new RetryWithBackoffStrategy({
  maxRetries: 3,
  baseDelay: 1000,
  retryExchange: 'retry.exchange',
  deadLetterExchange: 'dlq.exchange'
});

// Use strategy with EventProcessor
const processor = new EventProcessor(eventBus, {
  retries: 0, // Strategy handles retries
  maxParallelism: 5,
  strategy: strategy
});
```

## Available Strategies

### 1. Dead Letter Queue Strategy

Routes failed messages to a dead letter exchange for manual inspection and recovery.

```typescript
const strategy = new DeadLetterQueueStrategy({
  deadLetterExchange: 'my.dlq'
});
```

**Features:**
- Automatic routing of failed messages to DLQ
- Preserves original message with failure reason
- Enables manual message recovery and debugging

**Use Cases:**
- Error handling and debugging
- Message recovery workflows
- Compliance and audit requirements

### 2. Retry with Exponential Backoff Strategy

Implements retry logic with exponential backoff using RabbitMQ's TTL and DLX features.

```typescript
const strategy = new RetryWithBackoffStrategy({
  maxRetries: 5,
  baseDelay: 1000,
  retryExchange: 'retry.exchange',
  deadLetterExchange: 'dlq.exchange'
});
```

**Features:**
- Exponential backoff delays (1s, 2s, 4s, 8s, 16s...)
- Configurable maximum retry attempts
- Automatic routing to DLQ after max retries
- Preserves retry count in message headers

**Use Cases:**
- Handling transient failures
- Rate limiting and backpressure
- Service recovery scenarios

### 3. Batch Processing Strategy

Processes messages in batches to improve throughput and reduce processing overhead.

```typescript
const strategy = new BatchProcessingStrategy({
  batchSize: 20,
  batchTimeout: 2000,
  deadLetterExchange: 'dlq.exchange'
});
```

**Features:**
- Configurable batch size and timeout
- Automatic batch processing when size or timeout reached
- Parallel processing of batch messages
- Failed batch messages routed to DLQ

**Use Cases:**
- High-throughput message processing
- Database bulk operations
- API rate limiting compliance

### 4. Priority Queue Strategy

Processes messages based on priority levels, ensuring high-priority messages are handled first.

```typescript
const strategy = new PriorityQueueStrategy({
  maxPriority: 10,
  deadLetterExchange: 'dlq.exchange'
});
```

**Features:**
- Priority-based message ordering
- Configurable maximum priority level
- Automatic priority queue management
- Failed messages routed to DLQ

**Use Cases:**
- Critical vs. non-critical message handling
- SLA compliance for high-priority events
- Resource allocation based on importance

### 5. TTL (Time-To-Live) Strategy

Automatically expires messages that are too old, preventing stale messages from being processed.

```typescript
const strategy = new TTLStrategy({
  defaultTTL: 300000, // 5 minutes
  deadLetterExchange: 'dlq.exchange'
});
```

**Features:**
- Configurable default TTL
- Per-message TTL override via headers
- Automatic message age calculation
- Expired messages routed to DLQ

**Use Cases:**
- Time-sensitive message processing
- Preventing stale data processing
- Compliance with data retention policies

### 6. Circuit Breaker Strategy

Implements the circuit breaker pattern to prevent cascading failures and provide graceful degradation.

```typescript
const strategy = new CircuitBreakerStrategy({
  failureThreshold: 5,
  recoveryTimeout: 60000, // 1 minute
  deadLetterExchange: 'dlq.exchange'
});
```

**Features:**
- Configurable failure threshold
- Automatic circuit state management (CLOSED → OPEN → HALF_OPEN)
- Recovery timeout for circuit reset
- Failed messages routed to DLQ during OPEN state

**Use Cases:**
- Preventing cascading failures
- Service degradation handling
- Fault tolerance and resilience

## Composite Strategies

You can combine multiple strategies for more sophisticated message processing by creating custom strategies that extend the base `RabbitMQProcessingStrategy` class and implement multiple behaviors.

## Configuration Options

Each strategy has its own configuration interface. Refer to the individual strategy documentation above for specific configuration options.

## Best Practices

### 1. Exchange Setup

Ensure your RabbitMQ exchanges are properly configured:

```typescript
// Set up dead letter exchange
await channel.assertExchange('dlq.exchange', 'topic', { durable: true });

// Set up retry exchange
await channel.assertExchange('retry.exchange', 'topic', { durable: true });
```

### 2. Queue Configuration

Configure queues with appropriate DLX bindings:

```typescript
await channel.assertQueue('my.queue', {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': 'dlq.exchange',
    'x-dead-letter-routing-key': 'dead.letter'
  }
});
```

### 3. Error Handling

Always provide a dead letter exchange for error handling:

```typescript
const strategy = new RetryWithBackoffStrategy({
  maxRetries: 3,
  deadLetterExchange: 'dlq.exchange' // Always provide DLQ
});
```

### 4. Monitoring

Monitor your dead letter queues for failed messages:

```typescript
// Subscribe to dead letter queue for monitoring
await eventBus.subscribe('dead.letter', (message) => {
  console.error('Message failed processing:', message);
  // Send alert, log to monitoring system, etc.
});
```

## Examples

See the `strategy-examples.ts` file for complete working examples of each strategy.

## Migration from Default Strategy

To migrate from the default SOAP strategy to RabbitMQ-specific strategies:

1. **Identify your requirements** - What RabbitMQ features do you need?
2. **Choose appropriate strategy** - Create the right strategy class directly
3. **Configure exchanges** - Set up required RabbitMQ exchanges
4. **Update EventProcessor** - Pass the strategy to your EventProcessor
5. **Test thoroughly** - Ensure your application handles the new behavior correctly

```typescript
// Before (default strategy)
const processor = new EventProcessor(eventBus, {
  retries: 3,
  maxParallelism: 5
});

// After (RabbitMQ strategy)
const strategy = new RetryWithBackoffStrategy({
  maxRetries: 3,
  baseDelay: 1000
});

const processor = new EventProcessor(eventBus, {
  retries: 0, // Strategy handles retries
  maxParallelism: 5,
  strategy: strategy
});
```

## Troubleshooting

### Common Issues

1. **Missing Exchanges**: Ensure all required exchanges are declared
2. **Queue Configuration**: Check queue DLX bindings
3. **Message Headers**: Verify custom headers are properly set
4. **TTL Calculation**: Ensure timestamp headers are in correct format

### Debug Mode

Enable debug logging to troubleshoot strategy behavior:

```typescript
const strategy = new RetryWithBackoffStrategy({
  maxRetries: 3,
  baseDelay: 1000
});

// Add debug logging
strategy.setChannel(channel);
```

## Performance Considerations

- **Batch Processing**: Use for high-throughput scenarios
- **Priority Queues**: Use sparingly as they can impact performance
- **TTL Strategy**: Consider message volume when setting TTL values
- **Circuit Breaker**: Monitor failure rates to tune thresholds

## Security Considerations

- **Dead Letter Queues**: Ensure DLQ access is properly secured
- **Message Headers**: Validate and sanitize custom headers
- **Exchange Permissions**: Use appropriate RabbitMQ permissions
- **Retry Limits**: Set reasonable retry limits to prevent abuse
