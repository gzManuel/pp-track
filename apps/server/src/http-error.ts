/**
 * Error carrying an intentional HTTP status code. The global error handler in
 * `index.ts` forwards `statusCode` + `message` to the client for codes < 500,
 * so throwing this from anywhere inside a handler produces a clean, typed
 * error response instead of an opaque 500.
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
