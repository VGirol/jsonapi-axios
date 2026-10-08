import { InternalAxiosRequestConfig } from "axios";
import { AxiosRequestInterceptor } from "../contracts";
import { isJsonBody } from "../../support";

const JSONAPI = "application/vnd.api+json";

// The Accept header that axios sends when nobody sets one
const AXIOS_DEFAULT_ACCEPT = "application/json, text/plain, */*";

export const RequestHeaderInterceptor: AxiosRequestInterceptor = {
  onFulfilled: function (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    // Keep the headers given by the caller, e.g. an Accept header with an "ext" parameter
    const accept = config.headers.get("Accept");
    if (!accept || accept === AXIOS_DEFAULT_ACCEPT) {
      config.headers.setAccept(JSONAPI);
    }
    if (isJsonBody(config.data) && !config.headers.has("Content-Type")) {
      config.headers.setContentType(JSONAPI);
    }

    return config;
  },
  onRejected: function (error: unknown): Promise<never> {
    return Promise.reject(error);
  }
};
