import Joi from 'joi';

export const RegisterSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

export const LoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

export const StartQuizSchema = Joi.object({
  category: Joi.string().required(),
  paymentReference: Joi.string().required()
});

export const SubmitAnswerSchema = Joi.object({
  sessionId: Joi.string().required(),
  questionIndex: Joi.number().min(0).required(),
  answer: Joi.string().required()
});