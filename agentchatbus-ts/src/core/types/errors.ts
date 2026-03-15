export class BusError extends Error {
  constructor(public message: string, public detail?: any) {
    super(message);
    this.name = "BusError";
  }
}

export class MissingSyncFieldsError extends BusError {
  constructor(missingFields: string[]) {
    super("MISSING_SYNC_FIELDS", {
      error: "MISSING_SYNC_FIELDS",
      missing_fields: missingFields,
      action: "CALL_SYNC_CONTEXT_THEN_RETRY"
    });
    this.name = "MissingSyncFieldsError";
  }
}

export class SeqMismatchError extends BusError {
  constructor(expected: number, current: number, newMessages: any[]) {
    super("SEQ_MISMATCH", {
      error: "SEQ_MISMATCH",
      expected_last_seq: expected,
      current_seq: current,
      new_messages: newMessages,
      action: "RE_READ_AND_RETRY"
    });
    this.name = "SeqMismatchError";
  }
}

export class ReplyTokenInvalidError extends BusError {
  constructor() {
    super("TOKEN_INVALID", {
      error: "TOKEN_INVALID",
      action: "CALL_SYNC_CONTEXT_THEN_RETRY"
    });
    this.name = "ReplyTokenInvalidError";
  }
}

export class ReplyTokenExpiredError extends BusError {
  constructor(expiresAt: string) {
    super("TOKEN_EXPIRED", {
      error: "TOKEN_EXPIRED",
      expires_at: expiresAt,
      action: "CALL_SYNC_CONTEXT_THEN_RETRY"
    });
    this.name = "ReplyTokenExpiredError";
  }
}

export class ReplyTokenReplayError extends BusError {
  constructor(consumedAt?: string) {
    super("TOKEN_REPLAY", {
      error: "TOKEN_REPLAY",
      consumed_at: consumedAt,
      action: "CALL_SYNC_CONTEXT_THEN_RETRY"
    });
    this.name = "ReplyTokenReplayError";
  }
}

export class MessageNotFoundError extends BusError {
  constructor(messageId: string) {
    super("MESSAGE_NOT_FOUND", {
      error: "MESSAGE_NOT_FOUND",
      message_id: messageId
    });
    this.name = "MessageNotFoundError";
  }
}
