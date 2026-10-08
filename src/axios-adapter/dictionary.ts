import type { AxiosRequestConfig } from "axios";
import { Dictionary, jsonapiDictionary } from "@vgirol/jsonapi-ts";

// The adapter passes the dictionary of the request to the decoding interceptor through the axios config.
// Axios keeps a class instance by reference when it merges the config (it only clones plain objects).
const KEY = "jsonapiDictionary";

export const withDictionary = <D>(config: AxiosRequestConfig<D>, dictionary?: Dictionary): AxiosRequestConfig<D> =>
  typeof dictionary === "undefined" ? config : ({ ...config, [KEY]: dictionary } as AxiosRequestConfig<D>);

export const dictionaryOf = (config: unknown): Dictionary => {
  const dictionary = (config as Record<string, unknown> | undefined)?.[KEY];

  return dictionary instanceof Dictionary ? dictionary : jsonapiDictionary;
};
