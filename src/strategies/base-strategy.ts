/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  EventValidationError,
  EventParsingError,
  HandlerExecutionError,
} from "@soapjs/soap";
import { EventBase } from "@soapjs/soap";
import { EventProcessingStrategy } from "@soapjs/soap";

/**
 * Base class for RabbitMQ-specific processing strategies.
 * Provides common functionality for RabbitMQ message handling.
 */
export abstract class RabbitMQProcessingStrategy<
  MessageType,
  HeadersType = Record<string, unknown>
> implements EventProcessingStrategy<MessageType, HeadersType> {
  
  protected deadLetterExchange?: string;
  protected retryExchange?: string;

  constructor(
    protected options: {
      deadLetterExchange?: string;
      retryExchange?: string;
      maxRetries?: number;
      retryDelay?: number;
    } = {}
  ) {
    this.deadLetterExchange = options.deadLetterExchange;
    this.retryExchange = options.retryExchange;
  }

  /**
   * Abstract method to be implemented by concrete strategies.
   */
  abstract process(
    message: EventBase<MessageType, HeadersType>,
    handler: (event: EventBase<MessageType, HeadersType>) => Promise<void>
  ): Promise<void>;

  /**
   * Validates the event message to ensure it meets required criteria.
   */
  protected validateMessage(message: EventBase<MessageType, HeadersType>): void {
    if (!message) {
      throw new EventValidationError("Message validation failed");
    }
    if (!message.message) {
      throw new EventValidationError("Message payload is required");
    }
  }
}
