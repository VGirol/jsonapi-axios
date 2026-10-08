import { isSerializable } from "@vgirol/jsonapi-ts";

/**
 * Whether the request data is sent as a JSON:API document: a model, a plain object or array (a document already
 * serialized), or a string. A `FormData`, `Blob`, `URLSearchParams` or stream is left to axios.
 */
export const isJsonBody = (data: unknown): boolean => {
  if (typeof data === "string" || isSerializable(data) || Array.isArray(data)) {
    return true;
  }
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(data);

  return prototype === Object.prototype || prototype === null;
};
