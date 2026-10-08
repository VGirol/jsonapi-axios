# @vgirol/jsonapi-axios

[Axios](https://axios-http.com) adapter for [`@vgirol/jsonapi-ts`](https://github.com/VGirol/jsonapi-ts), a typed
JSON:API client for TypeScript.

> **Status:** `0.x`. The API may still change between minor versions.

## Installation

```sh
npm install @vgirol/jsonapi-axios @vgirol/jsonapi-ts axios
```

`@vgirol/jsonapi-ts` and `axios` are peer dependencies: the application installs them once, and the adapter uses
those copies. A single copy of `@vgirol/jsonapi-ts` matters: the models registered by the application and the
`instanceof` checks on errors and documents would not work across two copies.

## Usage

Create the adapter on your own Axios instance, with its base URL and options, and give it to the client:

```ts
import axios from "axios";
import { JsonapiHttpClient, JsonapiResource, JsonapiResponseError, jsonapiDictionary } from "@vgirol/jsonapi-ts";
import { AxiosAdapter } from "@vgirol/jsonapi-axios";

class Article extends JsonapiResource<{ title: string }> {}
jsonapiDictionary.add("articles", Article);

const http = axios.create({ baseURL: "https://api.example.com", withCredentials: true });
const adapter = new AxiosAdapter(http);
const client = new JsonapiHttpClient(adapter);

const doc = await client.getCollection<Article>({ path: "/articles", query: { sort: ["title"] } });
console.log(doc.data.map((article) => article.attribute("title")));
```

Everything else (models, URLs, serialization, dictionaries) is the same as with `@vgirol/jsonapi-ts`: see
[its documentation](https://github.com/VGirol/jsonapi-ts#readme).

### Authentication

`setAuthorization()` sets the `Authorization` header on the Axios instance, so it applies to every request sent with
it:

```ts
adapter.setAuthorization("Bearer", "my-token");

// ...and after logging out
adapter.removeAuthorization();
```

## Interceptors

The interceptors of the adapter are Axios interceptors, installed on the Axios instance: they apply to every request
sent with it, through the adapter or not. The adapter installs five of them:

| Name                      | Kind     | Role                                                                                                 |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `request-header`          | request  | sets `Accept`, and `Content-Type` for a JSON body, to `application/vnd.api+json`, unless already set |
| `request-jsonapi-version` | request  | sets the `jsonapi.version` of a document sent                                                        |
| `request-encode-data`     | request  | serializes a model given as data                                                                     |
| `response-decode-data`    | response | decodes the body into a `JsonapiDocument` (`response.doc`, `response.json`)                          |
| `response-error`          | response | lets the error through                                                                               |

Add your own with a name, so that you can remove them later, and `once: true` to remove them after the next
request. A name is unique among the request interceptors, and among the response ones:

```ts
adapter.addResponseInterceptor({
  name: "log-total",
  interceptor: {
    onFulfilled: (response) => {
      console.log("total:", response.doc?.meta.value("page.total"));
      return response;
    },
    onRejected: (error) => {
      if (error.response?.status === 401) {
        console.log("logged out");
      }
      return Promise.reject(error);
    }
  }
});

adapter.removeResponseInterceptor("log-total");
```

Axios decides the order:

- **request** interceptors run in the **reverse** order they were added: yours run before the default ones, on data
  not yet serialized;
- **response** interceptors run in the order they were added: yours run after `response-decode-data`, and can read
  `response.doc`.

Interceptors added directly with `http.interceptors.*.use()` follow the same rules. `resetInterceptors()` ejects only the
interceptors installed by the adapter, then installs the default ones again: those added by other code stay.

## Errors

The adapter throws the errors of `@vgirol/jsonapi-ts`, so switching from the fetch adapter does not change the error
handling:

- a response outside the 2xx range gives a `JsonapiResponseError`: its `status`, its `document` when the body is a
  JSON:API one, and its `response`, the `AxiosResponse`;
- a request without response gives a `JsonapiNetworkError`;
- in both cases, the original `AxiosError` is the `cause`. A cancelled request is thrown as is.

```ts
try {
  await client.getSingle<Article>("/articles/404");
} catch (error) {
  if (error instanceof JsonapiResponseError) {
    console.log(error.status, error.document?.errors.toString());
  }
}
```

The conversion happens once every Axios interceptor has run: the `onRejected` of a response interceptor still
receives the `AxiosError`.

## License

[MIT](./LICENSE)
