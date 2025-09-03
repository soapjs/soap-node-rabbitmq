import amqp from 'amqplib';
import { EventBus, BackoffOptions } from '@soapjs/soap';
import { EventBase } from '@soapjs/soap';

/**
 * Configuration options for RabbitMQEventBus
 */
export interface RabbitMQEventBusOptions {
  /** RabbitMQ connection URL (e.g., 'amqp://localhost:5672') */
  connectionUrl: string;
  /** Exchange name for events (default: 'soap.events') */
  exchangeName?: string;
  /** Queue name prefix (default: 'soap') */
  queuePrefix?: string;
  /** Retry policy for failed operations */
  retryPolicy?: {
    /** Maximum number of retry attempts */
    maxRetries: number;
    /** Delay between retries in milliseconds */
    delay: number;
    /** Backoff strategy configuration */
    backoff?: BackoffOptions;
  };
}

/**
 * RabbitMQ implementation of the SoapJS EventBus interface.
 * 
 * Provides reliable event publishing, consuming, and processing capabilities
 * using RabbitMQ as the message broker backend.
 * 
 * @template MessageType - Type of the message payload
 * @template HeadersType - Type of the message headers
 * @template EventIdType - Type of the event identifier (default: string)
 * 
 * @example
 * ```typescript
 * const eventBus = new RabbitMQEventBus({
 *   connectionUrl: 'amqp://localhost:5672',
 *   exchangeName: 'my.events',
 *   queuePrefix: 'my-service'
 * });
 * 
 * await eventBus.connect();
 * 
 * // Publish an event
 * await eventBus.publish('user.created', {
 *   message: { userId: '123', name: 'John Doe' },
 *   headers: { correlation_id: 'corr-123', timestamp: new Date().toISOString() }
 * });
 * 
 * // Subscribe to events
 * await eventBus.subscribe('user.created', (eventData) => {
 *   console.log('User created:', eventData);
 * });
 * ```
 */
export class RabbitMQEventBus<MessageType, HeadersType, EventIdType = string> 
  implements EventBus<MessageType, HeadersType, EventIdType> {
  
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private subscriptions: Map<string, string> = new Map(); // subscriptionId -> queueName
  private retryPolicy: {
    maxRetries: number;
    delay: number;
    backoff?: BackoffOptions;
  };

  /**
   * Creates a new RabbitMQEventBus instance.
   * 
   * @param options - Configuration options for the event bus
   * @throws {Error} If required options are missing or invalid
   * 
   * @example
   * ```typescript
   * const eventBus = new RabbitMQEventBus({
   *   connectionUrl: 'amqp://localhost:5672',
   *   exchangeName: 'my.events',
   *   queuePrefix: 'my-service',
   *   retryPolicy: {
   *     maxRetries: 5,
   *     delay: 2000,
   *     backoff: {
   *       type: 'exponential',
   *       multiplier: 2,
   *       maxDelay: 30000,
   *       jitter: true
   *     }
   *   }
   * });
   * ```
   */
  constructor(private options: RabbitMQEventBusOptions) {
    this.retryPolicy = options.retryPolicy || {
      maxRetries: 3,
      delay: 1000,
      backoff: {
        type: 'exponential',
        multiplier: 2,
        maxDelay: 30000,
        jitter: true
      }
    };
  }

  /**
   * Establishes connection to RabbitMQ and sets up the exchange.
   * 
   * This method creates a connection to RabbitMQ, opens a channel,
   * and declares the exchange for event routing.
   * 
   * @returns Promise that resolves when connection is established
   * @throws {Error} If connection fails or exchange declaration fails
   * 
   * @example
   * ```typescript
   * try {
   *   await eventBus.connect();
   *   console.log('Connected to RabbitMQ');
   * } catch (error) {
   *   console.error('Connection failed:', error);
   * }
   * ```
   */
  async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.options.connectionUrl);
      this.channel = await this.connection.createChannel();
      
      // Set up error handling
      this.connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err);
      });
      
      this.channel.on('error', (err) => {
        console.error('RabbitMQ channel error:', err);
      });

      // Declare exchange
      const exchangeName = this.options.exchangeName || 'soap.events';
      await this.channel.assertExchange(exchangeName, 'topic', { durable: true });
      
    } catch (error) {
      throw new Error(`Failed to connect to RabbitMQ: ${error}`);
    }
  }

  /**
   * Closes the connection to RabbitMQ and cleans up resources.
   * 
   * This method gracefully closes the channel and connection,
   * ensuring proper cleanup of RabbitMQ resources.
   * 
   * @returns Promise that resolves when disconnection is complete
   * @throws {Error} If disconnection fails
   * 
   * @example
   * ```typescript
   * try {
   *   await eventBus.disconnect();
   *   console.log('Disconnected from RabbitMQ');
   * } catch (error) {
   *   console.error('Disconnection failed:', error);
   * }
   * ```
   */
  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
    } catch (error) {
      throw new Error(`Failed to disconnect from RabbitMQ: ${error}`);
    }
  }

  /**
   * Checks if the RabbitMQ connection is healthy and responsive.
   * 
   * This method performs a lightweight health check by attempting to
   * create and delete a temporary queue to verify the connection is alive.
   * 
   * @returns Promise that resolves to true if connection is healthy, false otherwise
   * 
   * @example
   * ```typescript
   * const isHealthy = await eventBus.checkHealth();
   * if (!isHealthy) {
   *   console.log('Connection is unhealthy, attempting to reconnect...');
   *   await eventBus.connect();
   * }
   * ```
   */
  async checkHealth(): Promise<boolean> {
    try {
      if (!this.connection || !this.channel) {
        return false;
      }
      
      // Try to declare a temporary queue to check if the connection is alive
      const tempQueue = await this.channel.assertQueue('', { exclusive: true });
      await this.channel.deleteQueue(tempQueue.queue);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Publishes an event to RabbitMQ.
   * 
   * This method serializes the event data and publishes it to the configured
   * exchange with the event ID as the routing key.
   * 
   * @param event - The event identifier (used as routing key)
   * @param eventData - The event data containing message, headers, and optional error
   * @returns Promise that resolves when the event is published
   * @throws {Error} If not connected to RabbitMQ or publishing fails
   * 
   * @example
   * ```typescript
   * await eventBus.publish('user.created', {
   *   message: { userId: '123', name: 'John Doe' },
   *   headers: { 
   *     correlation_id: 'corr-123', 
   *     timestamp: new Date().toISOString(),
   *     source: 'user-service'
   *   }
   * });
   * ```
   */
  async publish(event: EventIdType, eventData: EventBase<MessageType, HeadersType>): Promise<void> {
    if (!this.channel) {
      throw new Error('Not connected to RabbitMQ');
    }

    try {
      const exchangeName = this.options.exchangeName || 'soap.events';
      const routingKey = String(event);
      
      const message = Buffer.from(JSON.stringify({
        message: eventData.message,
        headers: eventData.headers,
        error: eventData.error
      }));

      const published = this.channel.publish(exchangeName, routingKey, message, {
        persistent: true,
        messageId: this.generateMessageId(),
        timestamp: Date.now(),
        headers: eventData.headers
      });

      if (!published) {
        throw new Error('Failed to publish message - channel buffer is full');
      }
    } catch (error) {
      throw new Error(`Failed to publish event: ${error}`);
    }
  }

  /**
   * Subscribes to events with the specified event ID.
   * 
   * This method creates a durable queue, binds it to the exchange with the event ID
   * as routing key, and sets up a consumer to handle incoming events.
   * 
   * @param event - The event identifier to subscribe to
   * @param handler - Function to handle incoming events
   * @returns Promise that resolves when subscription is set up
   * @throws {Error} If not connected to RabbitMQ or subscription setup fails
   * 
   * @example
   * ```typescript
   * await eventBus.subscribe('user.created', (eventData) => {
   *   console.log('Received user created event:', eventData.message);
   *   console.log('Headers:', eventData.headers);
   * });
   * ```
   */
  async subscribe(event: EventIdType, handler: (data: EventBase<MessageType, HeadersType>) => void): Promise<void> {
    if (!this.channel) {
      throw new Error('Not connected to RabbitMQ');
    }

    try {
      const exchangeName = this.options.exchangeName || 'soap.events';
      const queuePrefix = this.options.queuePrefix || 'soap';
      const queueName = `${queuePrefix}.${event}.${Date.now()}`;
      const routingKey = String(event);

      // Declare queue
      const queue = await this.channel.assertQueue(queueName, { 
        durable: true,
        exclusive: false,
        autoDelete: false
      });

      // Bind queue to exchange
      await this.channel.bindQueue(queue.queue, exchangeName, routingKey);

      // Set up consumer - pass parsed EventBase object
      await this.channel.consume(queue.queue, (msg) => {
        if (msg) {
          try {
            const eventData: EventBase<MessageType, HeadersType> = JSON.parse(msg.content.toString());
            handler(eventData);
            this.channel?.ack(msg);
          } catch (error) {
            console.error('Error processing message:', error);
            this.channel?.nack(msg, false, false); // Don't requeue on error
          }
        }
      }, { noAck: false });

      // Store subscription for cleanup
      const subscriptionId = this.generateSubscriptionId();
      this.subscriptions.set(subscriptionId, queue.queue);
      
    } catch (error) {
      throw new Error(`Failed to subscribe to event: ${error}`);
    }
  }





  /**
   * Unsubscribes from an event by removing the associated queue.
   * 
   * This method removes the subscription and deletes the associated queue
   * from RabbitMQ. If the subscription doesn't exist, the method returns silently.
   * 
   * @param subscriptionId - The subscription ID to unsubscribe from
   * @returns Promise that resolves when unsubscription is complete
   * @throws {Error} If queue deletion fails
   * 
   * @example
   * ```typescript
   * const subscriptionId = 'sub-123';
   * await eventBus.unsubscribe(subscriptionId);
   * ```
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const queueName = this.subscriptions.get(subscriptionId);
    if (!queueName || !this.channel) {
      return;
    }

    try {
      await this.channel.deleteQueue(queueName);
      this.subscriptions.delete(subscriptionId);
    } catch (error) {
      throw new Error(`Failed to unsubscribe: ${error}`);
    }
  }

  /**
   * Acknowledges a message (no-op in this implementation).
   * 
   * In RabbitMQ, message acknowledgment is handled automatically in the consume callback.
   * This method is kept for interface compatibility with the EventBus interface.
   * 
   * @param messageId - The message ID to acknowledge
   * @returns Promise that resolves immediately
   * 
   * @example
   * ```typescript
   * await eventBus.acknowledge('msg-123');
   * ```
   */
  async acknowledge(messageId: string): Promise<void> {
    // In RabbitMQ, acknowledgment is handled automatically in the consume callback
    // This method is kept for interface compatibility
  }

  /**
   * Rejects a message (no-op in this implementation).
   * 
   * In RabbitMQ, message rejection is handled in the consume callback.
   * This method is kept for interface compatibility with the EventBus interface.
   * 
   * @param messageId - The message ID to reject
   * @param requeue - Whether to requeue the message (ignored in this implementation)
   * @returns Promise that resolves immediately
   * 
   * @example
   * ```typescript
   * await eventBus.reject('msg-123', false);
   * ```
   */
  async reject(messageId: string, requeue: boolean = false): Promise<void> {
    // In RabbitMQ, rejection is handled in the consume callback
    // This method is kept for interface compatibility
  }

  /**
   * Sets the retry policy for failed operations.
   * 
   * This method configures the retry behavior for operations that may fail,
   * such as connection attempts or message publishing.
   * 
   * @param retries - Maximum number of retry attempts
   * @param delay - Base delay between retries in milliseconds
   * @param backoff - Optional backoff strategy configuration
   * 
   * @example
   * ```typescript
   * eventBus.setRetryPolicy(5, 2000, {
   *   type: 'exponential',
   *   multiplier: 2,
   *   maxDelay: 30000,
   *   jitter: true
   * });
   * ```
   */
  setRetryPolicy(retries: number, delay: number, backoff?: BackoffOptions): void {
    this.retryPolicy = {
      maxRetries: retries,
      delay,
      backoff
    };
  }

  /**
   * Subscribes to events matching a routing pattern.
   * 
   * This method creates a queue and binds it to the exchange using a routing pattern
   * (e.g., 'user.*' to match all user events). The handler receives both the event ID
   * and the event data.
   * 
   * @param pattern - The routing pattern to match (e.g., 'user.*', '*.created')
   * @param handler - Function to handle matching events
   * @returns Promise that resolves to the subscription ID
   * @throws {Error} If not connected to RabbitMQ or subscription setup fails
   * 
   * @example
   * ```typescript
   * const subscriptionId = await eventBus.subscribeToPattern('user.*', (eventId, eventData) => {
   *   console.log(`Received ${eventId}:`, eventData.message);
   * });
   * ```
   */
  async subscribeToPattern(pattern: string, handler: (eventId: EventIdType, event: EventBase<MessageType, HeadersType>) => void): Promise<string> {
    if (!this.channel) {
      throw new Error('Not connected to RabbitMQ');
    }

    try {
      const exchangeName = this.options.exchangeName || 'soap.events';
      const queuePrefix = this.options.queuePrefix || 'soap';
      const queueName = `${queuePrefix}.pattern.${Date.now()}`;

      // Declare queue
      const queue = await this.channel.assertQueue(queueName, { 
        durable: true,
        exclusive: false,
        autoDelete: false
      });

      // Bind queue to exchange with pattern
      await this.channel.bindQueue(queue.queue, exchangeName, pattern);

      // Set up consumer
      await this.channel.consume(queue.queue, (msg) => {
        if (msg) {
          try {
            const eventData: EventBase<MessageType, HeadersType> = JSON.parse(msg.content.toString());
            const eventId = msg.fields.routingKey as EventIdType;
            handler(eventId, eventData);
            this.channel?.ack(msg);
          } catch (error) {
            console.error('Error processing pattern message:', error);
            this.channel?.nack(msg, false, false);
          }
        }
      }, { noAck: false });

      const subscriptionId = this.generateSubscriptionId();
      this.subscriptions.set(subscriptionId, queue.queue);
      return subscriptionId;
      
    } catch (error) {
      throw new Error(`Failed to subscribe to pattern: ${error}`);
    }
  }

  /**
   * Subscribes to events for batch processing.
   * 
   * This method creates a queue and sets up batch processing where events are
   * collected and processed in batches. Events are processed when either the
   * batch size (10) is reached or after a timeout (1 second).
   * 
   * @param event - The event identifier to subscribe to
   * @param handler - Function to handle batches of events
   * @returns Promise that resolves to the subscription ID
   * @throws {Error} If not connected to RabbitMQ or subscription setup fails
   * 
   * @example
   * ```typescript
   * const subscriptionId = await eventBus.subscribeBatch('user.events', (events) => {
   *   console.log(`Processing ${events.length} events in batch`);
   *   events.forEach(event => {
   *     // Process each event in the batch
   *     console.log('Event:', event.message);
   *   });
   * });
   * ```
   */
  async subscribeBatch(event: EventIdType, handler: (events: EventBase<MessageType, HeadersType>[]) => void): Promise<string> {
    if (!this.channel) {
      throw new Error('Not connected to RabbitMQ');
    }

    try {
      const exchangeName = this.options.exchangeName || 'soap.events';
      const queuePrefix = this.options.queuePrefix || 'soap';
      const queueName = `${queuePrefix}.batch.${event}.${Date.now()}`;
      const routingKey = String(event);

      // Declare queue
      const queue = await this.channel.assertQueue(queueName, { 
        durable: true,
        exclusive: false,
        autoDelete: false
      });

      // Bind queue to exchange
      await this.channel.bindQueue(queue.queue, exchangeName, routingKey);

      const batch: EventBase<MessageType, HeadersType>[] = [];
      const batchSize = 10; // Process in batches of 10
      const batchTimeout = 1000; // Or after 1 second

      let batchTimer: NodeJS.Timeout | null = null;

      const processBatch = () => {
        if (batch.length > 0) {
          handler([...batch]);
          batch.length = 0;
        }
        if (batchTimer) {
          clearTimeout(batchTimer);
          batchTimer = null;
        }
      };

      // Set up consumer
      await this.channel.consume(queue.queue, (msg) => {
        if (msg) {
          try {
            const eventData: EventBase<MessageType, HeadersType> = JSON.parse(msg.content.toString());
            batch.push(eventData);
            this.channel?.ack(msg);

            if (batch.length >= batchSize) {
              processBatch();
            } else if (!batchTimer) {
              batchTimer = setTimeout(processBatch, batchTimeout);
            }
          } catch (error) {
            console.error('Error processing batch message:', error);
            this.channel?.nack(msg, false, false);
          }
        }
      }, { noAck: false });

      const subscriptionId = this.generateSubscriptionId();
      this.subscriptions.set(subscriptionId, queue.queue);
      return subscriptionId;
      
    } catch (error) {
      throw new Error(`Failed to subscribe to batch: ${error}`);
    }
  }

  /**
   * Generates a unique message ID for published messages.
   * 
   * @private
   * @returns A unique message ID string
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generates a unique subscription ID for tracking subscriptions.
   * 
   * @private
   * @returns A unique subscription ID string
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
