import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID không hợp lệ');

export const testIdParam = z.object({ testId: objectId });
export const assignmentIdParam = z.object({ assignmentId: objectId });
export const questionIdParam = z.object({ questionId: objectId });

const optionSchema = z.object({
  text: z.string().min(1, 'Nội dung đáp án là bắt buộc'),
  isCorrect: z.boolean().optional().default(false)
});

const questionSchema = z.object({
  type: z.literal('MULTIPLE_CHOICE').optional().default('MULTIPLE_CHOICE'),
  question: z.string().min(1, 'Nội dung câu hỏi là bắt buộc'),
  score: z.number().int().min(1, 'Điểm phải lớn hơn 0'),
  options: z.array(optionSchema).min(2, 'Phải có ít nhất 2 đáp án')
}).superRefine((val, ctx) => {
  const correctCount = val.options.filter(o => o.isCorrect).length;
  if (correctCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'Câu hỏi trắc nghiệm phải có đúng 1 đáp án đúng'
    });
  }
});

export const createTestBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().default(''),
  duration: z.number().int().min(1),
  passingScore: z.number().min(0),
  questions: z.array(questionSchema).min(1, 'Phải có ít nhất 1 câu hỏi')
});

export const updateTestBody = createTestBody.partial();

export const addQuestionBody = questionSchema;

export const updateQuestionBody = z.object({
  type: z.literal('MULTIPLE_CHOICE').optional(),
  question: z.string().min(1, 'Nội dung câu hỏi là bắt buộc').optional(),
  score: z.number().int().min(1, 'Điểm phải lớn hơn 0').optional(),
  options: z.array(optionSchema).min(2, 'Phải có ít nhất 2 đáp án').optional()
}).superRefine((val, ctx) => {
  if (val.options) {
    const correctCount = val.options.filter(o => o.isCorrect).length;
    if (correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Câu hỏi trắc nghiệm phải có đúng 1 đáp án đúng'
      });
    }
  }
});

export const reorderQuestionsBody = z.object({
  questionIds: z.array(objectId).min(1)
});

export const answerBody = z.object({
  questionId: objectId,
  selectedOptionId: objectId.optional().nullable()
});

export const submitBody = z.object({
  timeSpent: z.number().int().min(0).optional().default(0)
});
