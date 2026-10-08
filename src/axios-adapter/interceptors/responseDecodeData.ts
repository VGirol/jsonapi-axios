import { AxiosResponseDto, AxiosResponseInterceptor } from "../contracts";
import { Deserializer } from "@vgirol/jsonapi-ts";
import { dictionaryOf } from "../dictionary";

export const ResponseDecodeDataInterceptor: AxiosResponseInterceptor = {
  onFulfilled: function (response: AxiosResponseDto): AxiosResponseDto | Promise<AxiosResponseDto> {
    if (response.status !== 204 && response.data) {
      response.json = response.data;
      response.doc = Deserializer.decode(response.data, dictionaryOf(response.config));
    }

    return response;
  }
};
