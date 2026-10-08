import { AxiosError } from "axios";
import { AxiosResponseDto, AxiosResponseInterceptor } from "../contracts";

// Lets the AxiosError through: the adapter turns it into a jsonapi-ts error once every axios interceptor has run.
export const ResponseErrorInterceptor: AxiosResponseInterceptor = {
  onFulfilled: function (response: AxiosResponseDto): AxiosResponseDto | Promise<AxiosResponseDto> {
    return response;
  },
  onRejected: function (error: AxiosError): unknown {
    return Promise.reject(error);
  }
};
