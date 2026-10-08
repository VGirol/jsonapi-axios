import { InternalAxiosRequestConfig } from "axios";

/** An Axios request interceptor, as given to `axios.interceptors.request.use()`. */
export interface AxiosRequestInterceptor {
  /** Receives the request config and returns it, changed or not. */
  onFulfilled?: (value: InternalAxiosRequestConfig) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;
  /** Receives the error of a previous request interceptor. */
  onRejected?: (error: unknown) => unknown;
}
