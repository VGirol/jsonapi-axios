import { AxiosError, AxiosResponse } from "axios";
import { DocumentDto, JsonapiDocument } from "@vgirol/jsonapi-ts";

/** An Axios response, with the raw JSON body and the decoded document set by the `response-decode-data` interceptor. */
export type AxiosResponseDto<T = unknown, D = unknown, H = object> = AxiosResponse<T, D, H> & {
  /** The raw JSON:API body. */
  json?: DocumentDto;
  /** The decoded document. */
  doc?: JsonapiDocument;
};
/**
 * An Axios response interceptor, as given to `axios.interceptors.response.use()`. It runs before the adapter turns an
 * `AxiosError` into a `JsonapiResponseError`, so `onRejected` still receives the `AxiosError`.
 */
export interface AxiosResponseInterceptor {
  /** Receives a response with a 2xx status and returns it, changed or not. */
  onFulfilled?: (response: AxiosResponseDto) => AxiosResponseDto | Promise<AxiosResponseDto>;
  /** Receives the `AxiosError` of a failed request. */
  onRejected?: (error: AxiosError) => unknown;
}
