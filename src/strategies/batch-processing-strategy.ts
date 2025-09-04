import { HandlerExecutionError } from "@soapjs/soap";
import { EventBase } from "@soapjs/soap";
import { RabbitMQProcessingStrategy } from "./base-strategy";

/**
 * Batch Processing Strategy for RabbitMQ.
 * 
 * This strategy provides batch processing capabilities.
 * Note: Actual batching is handled by RabbitMQEventBus.subscribeBatch().
 */
export class BatchProcessingStrategy<
  MessageType,
  HeadersType = Record<string, unknown>
> extends RabbitMQProcessingStrategy<MessageType, HeadersType> {

  private batchSize: number;
  private batchTimeout: number;

  constructor(
    options: {
      batchSize?: number;
      batchTimeout?: number;
      deadLetterExchange?: string;
    } = {}
  ) {
    super(options);
    this.batchSize = options.batchSize || 10;
    this.batchTimeout = options.batchTimeout || 1000;
  }

  async process(
    message: EventBase<MessageType, HeadersType>,
    handler: (event: EventBase<MessageType, HeadersType>) => Promise<void>
  ): Promise<void> {
    this.validateMessage(message);
    
    try {
      await handler(message);
      console.log(`Message processed in batch context (batch size: ${this.batchSize}, timeout: ${this.batchTimeout}ms)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Batch processing failed: ${errorMessage}`);
      
      throw new HandlerExecutionError(
        `Batch processing failed: ${errorMessage}`
      );
    }
  }
}
