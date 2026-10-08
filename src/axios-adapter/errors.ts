import type { AxiosError, AxiosResponse } from "axios";
import {
  Deserializer,
  Dictionary,
  jsonapiDictionary,
  JsonapiDocument,
  JsonapiNetworkError,
  JsonapiResponseError
} from "@vgirol/jsonapi-ts";

// Checked by shape rather than with axios' isAxiosError, so that the package keeps importing types only from axios.
const isAxiosError = (error: unknown): error is AxiosError =>
  typeof error === "object" && error !== null && (error as { isAxiosError?: unknown }).isAxiosError === true;

const contentType = (response: AxiosResponse): string => {
  const headers = response.headers as { get?: (name: string) => unknown } & Record<string, unknown>;
  const value = typeof headers?.get === "function" ? headers.get("Content-Type") : headers?.["content-type"];

  return typeof value === "string" ? value : "";
};

const decodeErrorDocument = (response: AxiosResponse, dictionary: Dictionary): JsonapiDocument | undefined => {
  if (!contentType(response).trim().toLowerCase().startsWith("application/vnd.api+json")) {
    return undefined;
  }

  try {
    const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;

    return typeof data === "object" && data !== null ? Deserializer.decode(data, dictionary) : undefined;
  } catch {
    // Malformed body: the error keeps the status and the response only
    return undefined;
  }
};

/**
 * Turns an axios error into the errors of jsonapi-ts, so that the callers handle the same errors whatever the adapter.
 * The axios error is kept as `cause`. A cancelled request, or any other error, is returned as is.
 */
export const toJsonapiError = (error: unknown, dictionary: Dictionary = jsonapiDictionary): unknown => {
  if (!isAxiosError(error) || error.code === "ERR_CANCELED") {
    return error;
  }

  if (typeof error.response !== "undefined") {
    return new JsonapiResponseError<AxiosResponse>(
      error.response.status,
      error.response,
      decodeErrorDocument(error.response, dictionary),
      { cause: error }
    );
  }

  if (typeof error.request !== "undefined") {
    return new JsonapiNetworkError(error);
  }

  return error;
};
