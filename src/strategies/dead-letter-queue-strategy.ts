import { HandlerExecutionError } from "@soapjs/soap";
import { EventBase } from "@soapjs/soap";
import { RabbitMQProcessingStrategy } from "./base-strategy";

/**
 * Dead Letter Queue Strategy for RabbitMQ.
 * 
 * This strategy routes failed messages to a dead letter exchange,
 * allowing for proper error handling and message recovery.
 */
export class DeadLetterQueueStrategy<
  MessageType,
  HeadersType = Record<string, unknown>
> extends RabbitMQProcessingStrategy<MessageType, HeadersType> {

  constructor(
    options: {
      deadLetterExchange?: string;
      maxRetries?: number;
    } = {}
  ) {
    super(options);
  }

  async process(
    message: EventBase<MessageType, HeadersType>,
    handler: (event: EventBase<MessageType, HeadersType>) => Promise<void>
  ): Promise<void> {
    try {
      this.validateMessage(message);
      await handler(message);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Log the error and re-throw to let EventProcessor handle DLQ routing
      console.error(`Message failed processing, will be routed to DLQ: ${errorMessage}`);
      
      throw new HandlerExecutionError(
        `Message processing failed: ${errorMessage}`
      );
    }
  }
}
