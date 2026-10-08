import { AxiosInstance, AxiosRequestConfig, RawAxiosRequestHeaders } from "axios";
import { toArray } from "../support";
import { AdapterContract, JsonapiResource, JsonapiUrl, UrlType } from "@vgirol/jsonapi-ts";
import {
  AxiosAdapterOptions,
  AxiosAdapterResponse,
  AxiosNamedRequestInterceptor,
  AxiosNamedResponseInterceptor,
  AxiosRegisteredInterceptor
} from "./types";
import {
  RequestDataInterceptor,
  RequestHeaderInterceptor,
  RequestJsonapiVersionInterceptor,
  ResponseDecodeDataInterceptor,
  ResponseErrorInterceptor
} from "./interceptors";
import { AxiosResponseDto } from "./contracts";
import { toJsonapiError } from "./errors";
import { withDictionary } from "./dictionary";

/**
 * An adapter for `@vgirol/jsonapi-ts` built on an Axios instance.
 *
 * Its interceptors are Axios interceptors, installed on the instance: they also apply to the other requests sent with
 * it. The default ones are:
 *
 * - `request-header` (request): sets `Accept`, and `Content-Type` for a JSON body, to `application/vnd.api+json`,
 *   unless the caller set them;
 * - `request-jsonapi-version` (request): sets the `jsonapi.version` of a document sent;
 * - `request-encode-data` (request): serializes a model;
 * - `response-decode-data` (response): decodes the body into a `JsonapiDocument`;
 * - `response-error` (response): lets the error through.
 *
 * Once every Axios interceptor has run, an `AxiosError` with a response becomes a `JsonapiResponseError`, and one
 * without a response a `JsonapiNetworkError`, with the `AxiosError` as `cause`. A cancelled request is thrown as is.
 *
 * @example
 * ```ts
 * const http = axios.create({ baseURL: "https://api.example.com" });
 * const client = new JsonapiHttpClient(new AxiosAdapter(http));
 * ```
 */
export class AxiosAdapter implements AdapterContract {
  private _options: AxiosRequestConfig = {};
  private _instance: AxiosInstance;
  private _interceptorNames: AxiosRegisteredInterceptor[] = [];
  private _lastError: unknown;

  /** The Axios instance. */
  public get http(): AxiosInstance {
    return this._instance;
  }

  /** Creates an adapter on an Axios instance. Called on a subclass, it creates an instance of the subclass. */
  static make<T extends AxiosAdapter>(this: new (instance: AxiosInstance) => T, axios: AxiosInstance): T {
    return new this(axios);
  }

  /**
   * Creates an adapter and installs the default interceptors on the Axios instance.
   *
   * @param instance - The Axios instance, with its own configuration (`baseURL`, credentials...).
   */
  constructor(instance: AxiosInstance) {
    this._instance = instance;
    this.addDefaultInterceptors();
  }

  /** Installs the default interceptors. */
  addDefaultInterceptors(): this {
    this.addRequestInterceptors([
      {
        name: "request-header",
        interceptor: RequestHeaderInterceptor
      },
      {
        name: "request-jsonapi-version",
        interceptor: RequestJsonapiVersionInterceptor
      },
      {
        name: "request-encode-data",
        interceptor: RequestDataInterceptor
      }
    ]);

    this.addResponseInterceptors([
      {
        name: "response-decode-data",
        interceptor: ResponseDecodeDataInterceptor
      },
      {
        name: "response-error",
        interceptor: ResponseErrorInterceptor
      }
    ]);

    return this;
  }

  /** Clears the options set on the adapter, and replaces its interceptors with the default ones. */
  reset(): this {
    return this.resetOptions().resetInterceptors();
  }

  /** Replaces the Axios options sent with every request of the adapter. */
  withOptions(options: AxiosRequestConfig): this {
    this._options = options;

    return this;
  }

  /** Sets one Axios option sent with every request of the adapter. */
  withOption(name: keyof AxiosRequestConfig, value: AxiosRequestConfig[keyof AxiosRequestConfig]): this {
    this._options[name] = value;

    return this;
  }

  /** Clears the options set on the adapter. */
  resetOptions(): this {
    this._options = {};

    return this;
  }

  /** Sets the method of the next requests (an option kept by the adapter). */
  setMethod(method: string): this {
    return this.withOption("method", method);
  }

  /** Sets the URL of the next requests (an option kept by the adapter). */
  setUrl(url: string): this {
    return this.withOption("url", url);
  }

  /** Sets the data of the next requests (an option kept by the adapter). */
  withData(data: unknown): this {
    return this.withOption("data", data);
  }

  /** Sets the Axios `validateStatus` option: which statuses resolve instead of rejecting. */
  withStatusValidation(fn: ((status: number) => boolean) | null): this {
    return this.withOption("validateStatus", fn);
  }

  /** Adds headers sent with every request of the adapter. */
  addHeaders(headers: RawAxiosRequestHeaders): this {
    return this.withOption("headers", {
      ...(this._options.headers ?? {}),
      ...headers
    });
  }

  /** Adds a header sent with every request of the adapter. */
  addHeader(name: string, value: string): this {
    return this.withOption("headers", {
      ...(this._options.headers ?? {}),
      [name]: value
    });
  }

  /**
   * Sets the `Authorization` header of the Axios instance, e.g. `setAuthorization("Bearer", token)`. It applies to
   * every request of the instance.
   */
  setAuthorization(tokenType: string, token: string) {
    this.http.defaults.headers.common.Authorization = `${tokenType} ${token}`;
  }

  /** Removes the `Authorization` header of the Axios instance. */
  removeAuthorization() {
    delete this.http.defaults.headers.common.Authorization;
  }

  /** Installs several request interceptors, in order. */
  addRequestInterceptors(interceptors: AxiosNamedRequestInterceptor | AxiosNamedRequestInterceptor[]): this {
    toArray(interceptors).forEach((interceptor) => this.addRequestInterceptor(interceptor));

    return this;
  }

  /** Installs a request interceptor on the Axios instance. A name already used by a request interceptor is ignored. */
  addRequestInterceptor({ interceptor, name, once }: AxiosNamedRequestInterceptor): this {
    if (this.findInterceptor(name, "request")) {
      return this;
    }

    this._interceptorNames.push({
      name: name,
      type: "request",
      id: this.http.interceptors.request.use(interceptor.onFulfilled, interceptor.onRejected),
      once: once ?? false
    });

    return this;
  }

  /**
   * Ejects a request interceptor.
   *
   * @throws Error when no interceptor has this name.
   */
  removeRequestInterceptor(name: string): this {
    return this.removeInterceptor(name, "request");
  }

  /**
   * Ejects the request interceptors installed by the adapter, the default ones included. The interceptors installed on
   * the Axios instance by other code are kept.
   */
  resetRequestInterceptors(): this {
    return this.ejectInterceptors("request");
  }

  /** Installs several response interceptors, in order. */
  addResponseInterceptors(interceptors: AxiosNamedResponseInterceptor | AxiosNamedResponseInterceptor[]): this {
    toArray(interceptors).forEach((interceptor) => this.addResponseInterceptor(interceptor));

    return this;
  }

  /** Installs a response interceptor on the Axios instance. A name already used by a response interceptor is ignored. */
  addResponseInterceptor({ interceptor, name, once }: AxiosNamedResponseInterceptor): this {
    if (this.findInterceptor(name, "response")) {
      return this;
    }

    this._interceptorNames.push({
      name: name,
      type: "response",
      id: this.http.interceptors.response.use(interceptor.onFulfilled, interceptor.onRejected),
      once: once ?? false
    });

    return this;
  }

  /**
   * Ejects a response interceptor.
   *
   * @throws Error when no interceptor has this name.
   */
  removeResponseInterceptor(name: string): this {
    return this.removeInterceptor(name, "response");
  }

  /**
   * Ejects the response interceptors installed by the adapter, the default ones included. The interceptors installed on
   * the Axios instance by other code are kept.
   */
  resetResponseInterceptors(): this {
    return this.ejectInterceptors("response");
  }

  /** Ejects the interceptors installed by the adapter, then installs the default ones again. */
  resetInterceptors(): this {
    return this.resetRequestInterceptors().resetResponseInterceptors().addDefaultInterceptors();
  }

  /**
   * Ejects an interceptor.
   *
   * @throws Error when no interceptor has this name.
   */
  removeInterceptor(name: string, type: "request" | "response"): this {
    const interceptor = this.findInterceptor(name, type);
    if (typeof interceptor === "undefined") {
      throw new Error("No one interceptor with this name is registered.");
    }
    this.http.interceptors[type].eject(interceptor.id);
    this._interceptorNames = this._interceptorNames.filter((item): boolean => item !== interceptor);

    return this;
  }

  private findInterceptor(name: string, type: "request" | "response"): AxiosRegisteredInterceptor | undefined {
    return this._interceptorNames.find((item): boolean => item.name === name && item.type === type);
  }

  // Ejects the interceptors installed by the adapter only: other code may use the same axios instance
  private ejectInterceptors(type: "request" | "response"): this {
    this._interceptorNames
      .filter((item): boolean => item.type === type)
      .forEach((item) => this.http.interceptors[type].eject(item.id));
    this._interceptorNames = this._interceptorNames.filter((item): boolean => item.type !== type);

    return this;
  }

  /**
   * Sends a request with the options of the adapter, overridden by the given ones.
   *
   * @throws `JsonapiResponseError` for a status outside the 2xx range (unless `validateStatus` says otherwise), with
   *   the
   *   decoded document when the body is a JSON:API one.
   * @throws `JsonapiNetworkError` when no response is received. A cancelled request is thrown as is.
   */
  async request<R extends JsonapiResource, D = unknown>(
    options?: AxiosAdapterOptions<D>
  ): Promise<AxiosAdapterResponse<R>> {
    const opt: AxiosRequestConfig<D> = {
      ...this._options,
      ...(options?.clientOptions ?? {})
    };
    if (typeof options !== "undefined") {
      opt.url = JsonapiUrl.asString(options.url);
      opt.method = options.method;
      if (typeof options.data !== "undefined") {
        opt.data = options.data;
      }
    }

    try {
      const response = await this.http.request<string | undefined, AxiosResponseDto<string | undefined>>(
        withDictionary(opt, options?.dictionary)
      );

      return {
        status: response.status,
        clientResponse: response,
        json: response.json as AxiosAdapterResponse<R>["json"],
        doc: response.doc as AxiosAdapterResponse<R>["doc"]
      };
    } catch (error: unknown) {
      // Converted here, after the axios interceptors, which still receive the AxiosError
      this._lastError = toJsonapiError(error, options?.dictionary);

      throw this._lastError;
    } finally {
      this._interceptorNames
        .filter((item): boolean => item.once)
        .forEach((item) => this.removeInterceptor(item.name, item.type));
    }
  }

  /** Sends a `GET` request. */
  get<R extends JsonapiResource>(url: UrlType): Promise<AxiosAdapterResponse<R>> {
    return this.request<R, never>({ url: url, method: "GET" });
  }

  /** Sends a `POST` request. */
  post<R extends JsonapiResource, D = unknown>(url: UrlType, data: D): Promise<AxiosAdapterResponse<R>> {
    return this.request<R, D>({ url: url, method: "POST", data: data });
  }

  /** Sends a `PUT` request. */
  put<R extends JsonapiResource, D = unknown>(url: UrlType, data: D): Promise<AxiosAdapterResponse<R>> {
    return this.request<R, D>({ url: url, method: "PUT", data: data });
  }

  /** Sends a `PATCH` request. */
  patch<R extends JsonapiResource, D = unknown>(url: UrlType, data: D): Promise<AxiosAdapterResponse<R>> {
    return this.request<R, D>({ url: url, method: "PATCH", data: data });
  }

  /** Sends a `DELETE` request. */
  delete<R extends JsonapiResource>(url: UrlType): Promise<AxiosAdapterResponse<R>> {
    return this.request<R, never>({ url: url, method: "DELETE" });
  }

  /** The error thrown by the last failed request, after its conversion. */
  getLastError(): unknown {
    return this._lastError;
  }
}
