export class ApiResponse<T> {
  constructor(
    public success: boolean,
    public message: string,
    public data?: T,
    public statusCode: number = 200
  ) {}

  static success<T>(message: string, data?: T, statusCode: number = 200): ApiResponse<T> {
    return new ApiResponse(true, message, data, statusCode);
  }

  static error<T>(message: string, statusCode: number = 500, data?: T): ApiResponse<T> {
    return new ApiResponse(false, message, data, statusCode);
  }
}

export const sendResponse = <T>(res: any, apiResponse: ApiResponse<T>) => {
  return res.status(apiResponse.statusCode).json({
    success: apiResponse.success,
    message: apiResponse.message,
    data: apiResponse.data
  });
};