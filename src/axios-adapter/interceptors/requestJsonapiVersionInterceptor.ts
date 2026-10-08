import { InternalAxiosRequestConfig } from "axios";
import { JsonapiDocument } from "@vgirol/jsonapi-ts";
import { AxiosRequestInterceptor } from "../contracts";

export const RequestJsonapiVersionInterceptor: AxiosRequestInterceptor = {
  onFulfilled: function (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    // Set jsonapi version
    if (typeof config.data !== "undefined" && config.data instanceof JsonapiDocument) {
      config.data.setJsonApiVersion("1.0");
    }

    return config;
  },
  onRejected: function (error: unknown): Promise<never> {
    return Promise.reject(error);
  }
};
