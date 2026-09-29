class SwellErrorImpl extends Error {
  status: number;
  body?: unknown;
  retry?: boolean;

  constructor(message: string | object, options: { status?: number; retry?: boolean } = {}) {
    const text =
      typeof message === "string"
        ? message
        : JSON.stringify(message, null, 2);

    super(text);
    this.name = "SwellError";
    this.status = options.status ?? 500;
    this.body = typeof message === "string" ? undefined : message;
    this.retry = options.retry;
  }
}

class SwellRejectionImpl extends Error {
  status: number;
  code: string;
  body: {
    $reject: {
      code: string;
      message: string;
      status: number;
    };
  };

  constructor(code: string, message: string, options: { status?: number } = {}) {
    const status =
      typeof options.status === "number" &&
      options.status >= 400 &&
      options.status < 500
        ? options.status
        : 422;

    super(message || "Request rejected by function");
    this.name = "SwellRejection";
    this.status = status;
    this.code = code;
    this.body = {
      $reject: {
        code,
        message: this.message,
        status,
      },
    };
  }
}

class SwellResponseImpl extends Response {
  constructor(data: string | object | undefined, options: ResponseInit = {}) {
    super(typeof data === "object" ? JSON.stringify(data) : data, options);
  }
}

(globalThis as any).SwellError = SwellErrorImpl;
(globalThis as any).SwellResponse = SwellResponseImpl;
(globalThis as any).SwellRejection = SwellRejectionImpl;

export {};
