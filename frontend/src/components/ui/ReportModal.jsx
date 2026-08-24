import { useRef, useState } from 'react';
import { reportService } from '../../services/api.js';
import { useTranslation } from 'react-i18next';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 Mo

function ReportModal({ reportedUser, onClose }) {
    const { t } = useTranslation();
    const [message, setMessage] = useState('');
    const [imagePreview, setImagePreview] = useState(null);
    const [imageData, setImageData] = useState(null);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(false);
    const fileRef = useRef(null);

    const handleImage = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Seules les images sont acceptées');
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            setError('Image trop volumineuse (max 5 Mo)');
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            setImageData(ev.target.result); // base64 data URL
            setImagePreview(ev.target.result);
            setError(null);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim()) {
            setError('Un message de signalement est requis');
            return;
        }

        setSending(true);
        setError(null);

        try {
            await reportService.send(reportedUser.id, message, imageData);
            setDone(true);
        } catch (err) {
            setError(err.message || 'Impossible d\'envoyer le signalement');
        } finally {
            setSending(false);
        }
    };

    return (
        <div
            className="antique-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="antique-modal paper border-5 shadow-large w-full max-w-md p-6">
                {done ? (
                    <div className="text-center">
                        <p className="text-3xl">✅</p>
                        <p className="mt-3 text-lg font-semibold text-white">{t('report.sent')}</p>
                        <p className="mt-1 text-sm text-slate-400">
                            {t('report.review', { username: reportedUser.username })}
                        </p>
                        <button
                            type="button"
                            onClick={onClose}
                            className="mt-5 rounded-full bg-slate-700 px-6 py-2 text-sm text-white hover:bg-slate-600"
                        >
                            {t('report.close')}
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="mb-5 flex items-start justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-widest text-red-400">{t('report.title')}</p>
                                <h2 className="mt-1 text-lg font-semibold text-white">
                                    {t('report.report_user', { username: reportedUser.username })}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="text-slate-500 hover:text-white text-xl leading-none"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                                    {t('report.reason')}
                                </label>
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    maxLength={1000}
                                    rows={4}
                                    placeholder={t('report.placeholder')}
                                    className="w-full resize-none rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                                />
                                <p className="mt-1 text-right text-xs text-slate-500">{message.length}/1000</p>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                                    {t('report.screenshot')}
                                </label>
                                {imagePreview ? (
                                    <div className="relative">
                                        <img
                                            src={imagePreview}
                                            alt={t('report.preview')}
                                            className="max-h-40 w-full rounded-xl object-cover border border-slate-700"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => { setImagePreview(null); setImageData(null); fileRef.current.value = ''; }}
                                            className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white hover:bg-black"
                                        >
                                            {t('report.delete')}
                                        </button>
                                    </div>
                                ) : (
                                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-800 px-3 py-4 text-sm text-slate-400 hover:border-slate-500 hover:text-slate-300">
                                        <span>📎</span>
                                        <span>{t('report.add_image')}</span>
                                        <input
                                            ref={fileRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImage}
                                            className="hidden"
                                        />
                                    </label>
                                )}
                            </div>

                            {error && (
                                <p className="rounded-lg bg-red-900/40 border border-red-800 px-3 py-2 text-xs text-red-300">
                                    {error}
                                </p>
                            )}

                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 rounded-full border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800"
                                >
                                    {t('report.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={sending || !message.trim()}
                                    className="flex-1 rounded-full bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                                >
                                    {sending ? t('report.sending') : t('report.send')}
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}

export default ReportModal;
