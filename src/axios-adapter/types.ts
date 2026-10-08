import { AxiosRequestConfig, AxiosResponse } from "axios";
import { AdapterOptions, AdapterResponse, JsonapiResource } from "@vgirol/jsonapi-ts";
import { AxiosRequestInterceptor, AxiosResponseInterceptor } from "./contracts";

/** The options of a request sent by the {@link AxiosAdapter}: its client options are an `AxiosRequestConfig`. */
export type AxiosAdapterOptions<D = unknown> = AdapterOptions<D, AxiosRequestConfig<D>>;

/** The response of the {@link AxiosAdapter}: its client response is the `AxiosResponse`. */
export type AxiosAdapterResponse<R extends JsonapiResource = JsonapiResource> = AdapterResponse<R, AxiosResponse>;

/** An Axios request interceptor with its name, as given to the {@link AxiosAdapter}. */
export interface AxiosNamedRequestInterceptor {
  /** The name, used to remove the interceptor. */
  name: string;
  /** The interceptor. */
  interceptor: AxiosRequestInterceptor;
  /** Whether the interceptor is removed after the next request, whether it succeeds or fails. */
  once?: boolean;
}

/** An Axios response interceptor with its name, as given to the {@link AxiosAdapter}. */
export interface AxiosNamedResponseInterceptor {
  /** The name, used to remove the interceptor. */
  name: string;
  /** The interceptor. */
  interceptor: AxiosResponseInterceptor;
  /** Whether the interceptor is removed after the next request, whether it succeeds or fails. */
  once?: boolean;
}

/** An interceptor registered by the {@link AxiosAdapter} on its Axios instance. */
export interface AxiosRegisteredInterceptor {
  /** The name of the interceptor. */
  name: string;
  /** Whether it is a request or a response interceptor. */
  type: "request" | "response";
  /** The id returned by Axios, used to eject the interceptor. */
  id: number;
  /** Whether the interceptor is removed after the next request, whether it succeeds or fails. */
  once: boolean;
}
