import express from 'express';
import passport from 'passport';
import multer from 'multer';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as controller from '../controllers/knowledgeBase.controller.js';
import * as schema from '../schemas/knowledgeBase.schema.js';
import { BadRequestError } from '../utils/AppError.js';

const router = express.Router();

// File filter for Documents (PDF, DOC, DOCX)
const documentFileFilter = (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new BadRequestError('Chỉ cho phép tải lên file PDF, DOC, hoặc DOCX!'), false);
    }
};

const uploadDocument = multer({
    storage: multer.memoryStorage(),
    fileFilter: documentFileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
    },
});

// Require auth and recruiter role for all routes
router.use(passport.authenticate('jwt', { session: false }));
router.use(authMiddleware.recruiterOnly);

router.post('/upload', uploadDocument.single('file'), controller.uploadDocument);
router.get('/', validationMiddleware.validateQuery(schema.queryDocumentsSchema), controller.getDocuments);
router.get('/stats', controller.getStats);
router.get('/:documentId', controller.getDocument);
router.patch('/:documentId', validationMiddleware.validateBody(schema.updateDocumentSchema), controller.updateDocument);
router.post('/:documentId/retry', controller.retryDocument);
router.delete('/:documentId', controller.deleteDocument);

export default router;