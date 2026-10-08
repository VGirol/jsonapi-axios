import { describe, it, expect, vi, beforeEach } from "vitest";
import axios, { AxiosError, AxiosInstance, AxiosResponse, CanceledError, InternalAxiosRequestConfig } from "axios";
import {
  Dictionary,
  JsonapiError,
  JsonapiHttpClient,
  JsonapiNetworkError,
  JsonapiResource,
  JsonapiResponseError
} from "@vgirol/jsonapi-ts";
import { AxiosAdapter } from "../src";

const JSONAPI = "application/vnd.api+json";

type Reply = { status: number; body?: unknown; contentType?: string } | Error;

/**
 * A real axios instance whose transport is simulated: axios still runs its interceptors and its request and response
 * transforms. Like the built-in transports, a status rejected by validateStatus rejects with an AxiosError.
 */
const makeHttp = (...replies: Reply[]) => {
  const sent: InternalAxiosRequestConfig[] = [];
  const transport = vi.fn(async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    sent.push(config);
    const reply = replies.length > 1 ? replies.shift()! : replies[0];
    if (reply instanceof Error) {
      throw reply instanceof AxiosError ? reply : new AxiosError(reply.message, "ERR_NETWORK", config, {});
    }

    const response: AxiosResponse = {
      status: reply.status,
      statusText: "",
      data: typeof reply.body === "undefined" ? "" : JSON.stringify(reply.body),
      headers: { "content-type": reply.contentType ?? JSONAPI },
      config: config
    };
    if (config.validateStatus && !config.validateStatus(reply.status)) {
      throw new AxiosError(`Request failed with status code ${reply.status}`, "ERR_BAD_REQUEST", config, {}, response);
    }

    return response;
  });

  return { http: axios.create({ baseURL: "https://api.test", adapter: transport }), sent, transport };
};

const article = (id: string, title = "Hello") => ({ type: "articles", id: id, attributes: { title: title } });

describe("AxiosAdapter responses", () => {
  it("decodes a 200 response with a document", async () => {
    const { http } = makeHttp({ status: 200, body: { data: article("1"), meta: { total: 1 } } });

    const response = await new AxiosAdapter(http).request({ url: "/articles/1", method: "GET" });

    expect(response.status).toBe(200);
    expect(response.json).toEqual({ data: article("1"), meta: { total: 1 } });
    expect(response.doc?.dataAsResource.attribute("title")).toBe("Hello");
    expect(response.doc?.meta.value("total")).toBe(1);
  });

  it("serializes the model of a POST and decodes the 201 response", async () => {
    const { http, sent } = makeHttp({ status: 201, body: { data: article("12") } });

    const response = await new AxiosAdapter(http).request({
      url: "/articles",
      method: "POST",
      data: JsonapiResource.from("articles", "", { title: "Hello" })
    });

    expect(response.status).toBe(201);
    expect(response.doc?.dataAsResource.id).toBe("12");
    expect(JSON.parse(sent[0].data)).toEqual({ data: { type: "articles", attributes: { title: "Hello" } } });
    expect(sent[0].headers.get("Content-Type")).toBe(JSONAPI);
  });

  it("sends a document already serialized as JSON", async () => {
    const { http, sent } = makeHttp({ status: 201, body: { data: article("12") } });
    const dto = { data: { type: "articles", attributes: { title: "Hello" } } };

    await new AxiosAdapter(http).request({ url: "/articles", method: "POST", data: dto });

    expect(JSON.parse(sent[0].data)).toEqual(dto);
    expect(sent[0].headers.get("Content-Type")).toBe(JSONAPI);
  });

  it("gives no document for a 204", async () => {
    const { http } = makeHttp({ status: 204 });

    const response = await new AxiosAdapter(http).request({ url: "/articles/1", method: "DELETE" });

    expect(response.status).toBe(204);
    expect(response.json).toBeUndefined();
    expect(response.doc).toBeUndefined();
  });
});

describe("AxiosAdapter errors", () => {
  it("throws a JsonapiResponseError without document for a 404 that is not JSON:API", async () => {
    const { http } = makeHttp({ status: 404, body: "Not found", contentType: "text/html" });
    const adapter = new AxiosAdapter(http);

    const error = (await adapter.request({ url: "/nope", method: "GET" }).catch((e) => e)) as JsonapiResponseError;

    expect(error).toBeInstanceOf(JsonapiResponseError);
    expect(error).toBeInstanceOf(JsonapiError);
    expect(error.status).toBe(404);
    expect(error.document).toBeUndefined();
    expect(error.cause).toBeInstanceOf(AxiosError);
    expect(adapter.getLastError()).toBe(error);
  });

  it("decodes the errors of a 422", async () => {
    const { http } = makeHttp({
      status: 422,
      body: {
        errors: [{ status: "422", detail: "The title is required.", source: { pointer: "/data/attributes/title" } }]
      }
    });

    const error = (await new AxiosAdapter(http)
      .request({ url: "/articles", method: "POST", data: { data: { type: "articles" } } })
      .catch((e) => e)) as JsonapiResponseError<AxiosResponse>;

    expect(error.status).toBe(422);
    expect(error.response.status).toBe(422);
    expect(error.document?.errors.all()[0].detail).toBe("The title is required.");
    expect(error.document?.errors.all()[0].source.pointer).toBe("/data/attributes/title");
  });

  it("throws a JsonapiNetworkError when no response is received", async () => {
    const { http } = makeHttp(new Error("Network Error"));

    const error = await new AxiosAdapter(http).request({ url: "/articles", method: "GET" }).catch((e) => e);

    expect(error).toBeInstanceOf(JsonapiNetworkError);
    expect((error as JsonapiNetworkError).cause).toBeInstanceOf(AxiosError);
  });

  it("rethrows a cancelled request as is", async () => {
    const { http } = makeHttp(new CanceledError());

    const error = await new AxiosAdapter(http).request({ url: "/articles", method: "GET" }).catch((e) => e);

    expect(error).toBeInstanceOf(CanceledError);
  });

  it("gives the AxiosError to the response interceptors before converting it", async () => {
    const { http } = makeHttp({ status: 500 });
    const seen: unknown[] = [];
    const adapter = new AxiosAdapter(http).addResponseInterceptor({
      name: "spy",
      interceptor: { onRejected: (error) => (seen.push(error), Promise.reject(error)) }
    });

    await expect(adapter.request({ url: "/articles", method: "GET" })).rejects.toBeInstanceOf(JsonapiResponseError);
    expect(seen[0]).toBeInstanceOf(AxiosError);
  });
});

describe("AxiosAdapter headers", () => {
  it("sends a GET with the JSON:API Accept header, without body and without Content-Type", async () => {
    const { http, sent } = makeHttp({ status: 200, body: { data: [] } });

    await new AxiosAdapter(http).request({ url: "/articles", method: "GET" });

    expect(sent[0].headers.get("Accept")).toBe(JSONAPI);
    expect(sent[0].headers.has("Content-Type")).toBe(false);
    expect(sent[0].data).toBeUndefined();
  });

  it("keeps the Accept and Content-Type headers given by the caller", async () => {
    const { http, sent } = makeHttp({ status: 200, body: { data: [] } });
    const atomic = `${JSONAPI}; ext="https://jsonapi.org/ext/atomic"`;

    await new AxiosAdapter(http).request({
      url: "/operations",
      method: "POST",
      data: { "atomic:operations": [] },
      clientOptions: { headers: { Accept: atomic, "Content-Type": atomic } }
    });

    expect(sent[0].headers.get("Accept")).toBe(atomic);
    expect(sent[0].headers.get("Content-Type")).toBe(atomic);
  });

  it("does not set the JSON:API Content-Type on a FormData", async () => {
    const { http, sent } = makeHttp({ status: 200, body: { data: null } });
    const form = new FormData();
    form.append("file", "content");

    await new AxiosAdapter(http).request({ url: "/uploads", method: "POST", data: form });

    expect(sent[0].headers.get("Content-Type")).not.toBe(JSONAPI);
  });

  it("sets and removes the Authorization header of the instance", async () => {
    const { http, sent } = makeHttp({ status: 200, body: { data: [] } });
    const adapter = new AxiosAdapter(http);

    adapter.setAuthorization("Bearer", "token");
    await adapter.request({ url: "/articles", method: "GET" });
    adapter.removeAuthorization();
    await adapter.request({ url: "/articles", method: "GET" });

    expect(sent[0].headers.get("Authorization")).toBe("Bearer token");
    expect(sent[1].headers.has("Authorization")).toBe(false);
  });
});

describe("AxiosAdapter interceptors", () => {
  let http: AxiosInstance;
  let adapter: AxiosAdapter;

  beforeEach(() => {
    ({ http } = makeHttp({ status: 200, body: { data: article("1") } }));
    adapter = new AxiosAdapter(http);
  });

  it("runs the request interceptors before the default ones, and the response ones after them", async () => {
    const calls: string[] = [];
    adapter
      .addRequestInterceptor({
        name: "spy",
        interceptor: {
          onFulfilled: (config) => (calls.push(`request:${config.data instanceof JsonapiResource}`), config)
        }
      })
      .addResponseInterceptor({
        name: "spy",
        interceptor: { onFulfilled: (response) => (calls.push(`response:${typeof response.doc}`), response) }
      });

    await adapter.request({ url: "/articles", method: "POST", data: JsonapiResource.from("articles", "", {}) });

    expect(calls).toEqual(["request:true", "response:object"]);
  });

  it("ignores an interceptor whose name is already used by an interceptor of the same kind", async () => {
    const first = vi.fn((config) => config);
    const second = vi.fn((config) => config);
    adapter
      .addRequestInterceptor({ name: "spy", interceptor: { onFulfilled: first } })
      .addRequestInterceptor({ name: "spy", interceptor: { onFulfilled: second } });

    await adapter.request({ url: "/articles", method: "GET" });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("can add an interceptor again after removing it", async () => {
    const spy = vi.fn((response) => response);
    adapter.addResponseInterceptor({ name: "spy", interceptor: { onFulfilled: spy } });
    adapter.removeResponseInterceptor("spy");
    adapter.addResponseInterceptor({ name: "spy", interceptor: { onFulfilled: spy } });

    await adapter.request({ url: "/articles", method: "GET" });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("removes an interceptor by its name and kind", () => {
    adapter.addRequestInterceptor({ name: "spy", interceptor: { onFulfilled: (config) => config } });

    expect(() => adapter.removeResponseInterceptor("spy")).toThrow();
    expect(() => adapter.removeRequestInterceptor("spy")).not.toThrow();
    expect(() => adapter.removeRequestInterceptor("spy")).toThrow();
  });

  it("runs a once interceptor for the next request only, whether it succeeds or fails", async () => {
    const { http: failing } = makeHttp({ status: 500 }, { status: 200, body: { data: [] } });
    const failingAdapter = new AxiosAdapter(failing);
    const once = vi.fn((config) => config);
    failingAdapter.addRequestInterceptor({ name: "once", interceptor: { onFulfilled: once }, once: true });

    await expect(failingAdapter.request({ url: "/articles", method: "GET" })).rejects.toBeInstanceOf(
      JsonapiResponseError
    );
    await failingAdapter.request({ url: "/articles", method: "GET" });

    expect(once).toHaveBeenCalledTimes(1);
    expect(() => failingAdapter.removeRequestInterceptor("once")).toThrow();
  });

  it("keeps the interceptors installed on the instance by other code when it resets its own", async () => {
    const foreign = vi.fn((response) => response);
    http.interceptors.response.use(foreign);
    const own = vi.fn((response) => response);
    adapter.addResponseInterceptor({ name: "own", interceptor: { onFulfilled: own } });

    adapter.resetInterceptors();
    const response = await adapter.request({ url: "/articles/1", method: "GET" });

    expect(foreign).toHaveBeenCalledTimes(1);
    expect(own).not.toHaveBeenCalled();
    expect(response.doc?.dataAsResource.id).toBe("1");
  });
});

describe("AxiosAdapter options", () => {
  it("does not keep the data of a helper for the next requests", async () => {
    const { http, sent } = makeHttp({ status: 200, body: { data: article("1") } });
    const adapter = new AxiosAdapter(http);

    await adapter.post("/articles", JsonapiResource.from("articles", "", { title: "Hello" }));
    await adapter.request({ url: "/articles", method: "GET" });

    expect(sent[0].method).toBe("post");
    expect(sent[1].method).toBe("get");
    expect(sent[1].data).toBeUndefined();
  });

  it("sends the options of the adapter with every request, overridden by the client options", async () => {
    const { http, sent } = makeHttp({ status: 200, body: { data: [] } });
    const adapter = new AxiosAdapter(http).withOption("timeout", 1000).addHeader("X-Trace", "on");

    await adapter.request({ url: "/articles", method: "GET" });
    await adapter.request({ url: "/articles", method: "GET", clientOptions: { timeout: 50 } });

    expect(sent[0].timeout).toBe(1000);
    expect(sent[0].headers.get("X-Trace")).toBe("on");
    expect(sent[1].timeout).toBe(50);
  });

  it("decodes with the dictionary of the request", async () => {
    class Article extends JsonapiResource<{ title: string }> {}
    const dictionary = new Dictionary();
    dictionary.add("articles", Article);
    const { http } = makeHttp({ status: 200, body: { data: article("1") } });

    const shared = await new AxiosAdapter(http).request({ url: "/articles/1", method: "GET" });
    const own = await new AxiosAdapter(http).request({ url: "/articles/1", method: "GET", dictionary: dictionary });

    expect(shared.doc?.dataAsResource).not.toBeInstanceOf(Article);
    expect(own.doc?.dataAsResource).toBeInstanceOf(Article);
  });
});

describe("AxiosAdapter with JsonapiHttpClient", () => {
  it("serves getSingle, getCollection, post, patch and delete", async () => {
    const { http, sent } = makeHttp(
      { status: 200, body: { data: article("1") } },
      { status: 200, body: { data: [article("1"), article("2")] } },
      { status: 201, body: { data: article("3") } },
      { status: 200, body: { data: article("3", "Updated") } },
      { status: 204 }
    );
    const client = new JsonapiHttpClient(new AxiosAdapter(http));

    const single = await client.getSingle("/articles/1");
    const collection = await client.getCollection({ path: "/articles", query: { sort: ["-title"] } });
    const created = await client.post("/articles", JsonapiResource.from("articles", "", { title: "New" }));
    const updated = await client.patch("/articles/3", created.data);
    const deleted = await client.delete("/articles/3");

    expect(single.data.id).toBe("1");
    expect(collection.data).toHaveLength(2);
    expect(created.data.id).toBe("3");
    expect(updated.data.attribute("title")).toBe("Updated");
    expect(deleted).toBeUndefined();
    expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual([
      "get /articles/1",
      "get /articles?sort=-title",
      "post /articles",
      "patch /articles/3",
      "delete /articles/3"
    ]);
  });
});
