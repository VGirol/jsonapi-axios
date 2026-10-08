// Runs the built packages together, as an application installs them: jsonapi-axios from its dist, and jsonapi-ts
// as installed from npm. Build the package before running it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import axios, { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import {
  JsonapiHttpClient,
  JsonapiResource,
  JsonapiResponseError,
  jsonapiDictionary,
  Dictionary
} from "@vgirol/jsonapi-ts";
import { AxiosAdapter } from "../../dist/index.js";

const jsonapiResponse =
  (status: number, body: unknown) =>
  async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const response: AxiosResponse = {
      status: status,
      statusText: "",
      data: JSON.stringify(body),
      headers: { "content-type": "application/vnd.api+json" },
      config: config
    };
    if (config.validateStatus && !config.validateStatus(status)) {
      throw new axios.AxiosError("Request failed", "ERR_BAD_REQUEST", config, {}, response);
    }

    return response;
  };

const packageJson = (name: string) =>
  JSON.parse(readFileSync(resolve(__dirname, "../..", name, "package.json"), "utf8")) as Record<string, never>;

describe("jsonapi-ts and jsonapi-axios built packages", () => {
  it("does not bundle jsonapi-ts nor axios in jsonapi-axios", () => {
    const code = readFileSync(resolve(__dirname, "../../dist/index.js"), "utf8");
    const imports = [...code.matchAll(/^import .* from "([^"]+)"/gm)].map((match) => match[1]);

    expect(imports).toEqual(["@vgirol/jsonapi-ts"]);
    expect(code).not.toMatch(/class JsonapiResource\b/);
  });

  it("declares a peer dependency range that the jsonapi-ts version satisfies", () => {
    const axiosPackage = packageJson(".");
    const tsPackage = packageJson("node_modules/@vgirol/jsonapi-ts");
    const range = (axiosPackage.peerDependencies as Record<string, string>)["@vgirol/jsonapi-ts"];
    const [major, minor] = (tsPackage.version as string).split(".");

    // A caret range on a 0.x version only accepts the same minor version
    expect(range).toBe(`^${major}.${minor}.0`);
    expect(axiosPackage.dependencies).toBeUndefined();
  });

  it("decodes with the models registered in the dictionary of the application", async () => {
    class Article extends JsonapiResource<{ title: string }> {}
    jsonapiDictionary.add("integration-articles", Article);
    const http = axios.create({
      adapter: jsonapiResponse(200, { data: { type: "integration-articles", id: "1", attributes: { title: "Hi" } } })
    });

    const doc = await new JsonapiHttpClient(new AxiosAdapter(http)).getSingle<Article>("/articles/1");

    expect(doc.data).toBeInstanceOf(Article);
    expect(doc.data.attribute("title")).toBe("Hi");
  });

  it("decodes with the dictionary of the client", async () => {
    class Post extends JsonapiResource {}
    const dictionary = new Dictionary();
    dictionary.add("posts", Post);
    const http = axios.create({ adapter: jsonapiResponse(200, { data: { type: "posts", id: "1", attributes: {} } }) });

    const doc = await new JsonapiHttpClient(new AxiosAdapter(http), dictionary).getSingle("/posts/1");

    expect(doc.data).toBeInstanceOf(Post);
  });

  it("throws errors that are instances of the jsonapi-ts classes of the application", async () => {
    const http = axios.create({ adapter: jsonapiResponse(422, { errors: [{ detail: "Invalid." }] }) });

    const error = await new JsonapiHttpClient(new AxiosAdapter(http)).getSingle("/articles/1").catch((e) => e);

    expect(error).toBeInstanceOf(JsonapiResponseError);
    expect((error as JsonapiResponseError).document?.errors.toString()).toBe("Invalid.");
  });
});
