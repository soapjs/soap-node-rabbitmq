import { HandlerExecutionError } from "@soapjs/soap";
import { EventBase } from "@soapjs/soap";
import { RabbitMQProcessingStrategy } from "./base-strategy";

/**
 * Priority Queue Strategy for RabbitMQ.
 * 
 * This strategy handles messages with different priority levels.
 * Note: Actual priority handling is done by RabbitMQ queue configuration.
 */
export class PriorityQueueStrategy<
  MessageType,
  HeadersType = Record<string, unknown>
> extends RabbitMQProcessingStrategy<MessageType, HeadersType> {

  private maxPriority: number;

  constructor(
    options: {
      maxPriority?: number;
      deadLetterExchange?: string;
    } = {}
  ) {
    super(options);
    this.maxPriority = options.maxPriority || 10;
  }

  async process(
    message: EventBase<MessageType, HeadersType>,
    handler: (event: EventBase<MessageType, HeadersType>) => Promise<void>
  ): Promise<void> {
    this.validateMessage(message);
    
    const priority = this.getPriority(message);
    
    try {
      await handler(message);
      console.log(`Message processed with priority ${priority}/${this.maxPriority}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Priority processing failed: ${errorMessage}`);
      
      throw new HandlerExecutionError(
        `Priority processing failed: ${errorMessage}`
      );
    }
  }

  private getPriority(message: EventBase<MessageType, HeadersType>): number {
    return (message.headers as any)?.['x-priority'] || 0;
  }
}
