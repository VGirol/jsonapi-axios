import { InternalAxiosRequestConfig } from "axios";
import { isSerializable, Serializer } from "@vgirol/jsonapi-ts";
import { AxiosRequestInterceptor } from "../contracts";

export const RequestDataInterceptor: AxiosRequestInterceptor = {
  onFulfilled: function (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    // A plain object (a document already serialized) is encoded by axios itself
    if (isSerializable(config.data)) {
      config.data = Serializer.source(config.data).toDocument();
    }

    return config;
  },
  onRejected: function (error: unknown): Promise<never> {
    return Promise.reject(error);
  }
};
