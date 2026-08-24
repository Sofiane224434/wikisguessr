import multer from 'multer';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (!allowedTypes.has(file.mimetype)) {
            const error = new Error('Format invalide. Utilisez une image JPEG, PNG ou WebP');
            error.status = 415;
            callback(error);
            return;
        }
        callback(null, true);
    }
});

export const avatarUpload = (req, res, next) => {
    upload.single('avatar')(req, res, (error) => {
        if (!error) {
            next();
            return;
        }

        const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.status || 400;
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? 'La photo ne doit pas dépasser 5 Mo'
            : error.message;
        res.status(status).json({ error: message });
    });
};