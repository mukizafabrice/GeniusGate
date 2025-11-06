import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ApiResponse, sendResponse } from '../utils/apiResponse';

export const validationMiddleware = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      const message =
        error.details?.[0]?.message || error.message || 'Invalid request';
      const response = ApiResponse.error(
        message,
        400
      );
      return sendResponse(res, response);
    }
    
    next();
  };
};