import { useRef, useState } from 'react';
import { reportService } from '../../services/api.js';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Image, Trash2, X, CheckCircle, Send } from 'lucide-react';

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
            await reportService.send(reportedUser.id, message, imageData, reportedUser.username);
            setDone(true);
        } catch (err) {
            setError(err.message || 'Impossible d\'envoyer le signalement');
        } finally {
            setSending(false);
        }
    };

    return (
        <div
            className="antique-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="antique-modal paper border-3 shadow-large w-full max-w-md p-6 bg-[#fbf6ee] text-[#2c1d11] rounded-2xl relative">
                {done ? (
                    <div className="text-center py-4">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-3 shadow-inner">
                            <CheckCircle size={32} />
                        </div>
                        <h3 className="text-xl font-bold font-serif text-[#34261a]">{t('report.sent')}</h3>
                        <p className="mt-2 text-sm text-[#5a4331] leading-relaxed">
                            {t('report.review', { username: reportedUser.username })}
                        </p>
                        <button
                            type="button"
                            onClick={onClose}
                            className="mt-6 rounded-full bg-[#4a3525] px-6 py-2 text-sm font-semibold text-[#fdfaf5] shadow-md hover:bg-[#342417] transition"
                        >
                            {t('report.close')}
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="mb-4 flex items-start justify-between border-b border-[#d8c7b0] pb-3">
                            <div>
                                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#a84232]">
                                    <ShieldAlert size={16} />
                                    <span>{t('report.title')}</span>
                                </div>
                                <h2 className="mt-1 text-xl font-bold font-serif text-[#34261a]">
                                    {t('report.report_user', { username: reportedUser.username })}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-full p-1 text-[#8c7355] hover:bg-[#ece2d0] hover:text-[#34261a] transition"
                                aria-label="Fermer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#4a3828]">
                                    {t('report.reason')}
                                </label>
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    maxLength={1000}
                                    rows={4}
                                    placeholder={t('report.placeholder')}
                                    className="w-full resize-none rounded-xl border border-[#c4ab89] bg-[#fffdfa] px-3 py-2 text-sm text-[#2c1d11] placeholder-[#9c8469] shadow-inner focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b]/30 focus:outline-none"
                                />
                                <p className="mt-1 text-right text-xs text-[#8c7355]">{message.length}/1000</p>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#4a3828]">
                                    {t('report.screenshot')}
                                </label>
                                {imagePreview ? (
                                    <div className="relative overflow-hidden rounded-xl border border-[#c4ab89] bg-[#fffdfa] p-1.5 shadow-inner">
                                        <img
                                            src={imagePreview}
                                            alt={t('report.preview')}
                                            className="max-h-40 w-full rounded-lg object-contain bg-[#f0e6d6]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setImagePreview(null);
                                                setImageData(null);
                                                if (fileRef.current) fileRef.current.value = '';
                                            }}
                                            className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-[#2c1d11]/80 px-2.5 py-1 text-xs font-medium text-[#fdfaf5] hover:bg-[#a84232] transition"
                                        >
                                            <Trash2 size={13} />
                                            <span>{t('report.delete')}</span>
                                        </button>
                                    </div>
                                ) : (
                                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#c4ab89] bg-[#f5ede0]/60 px-3 py-4 text-sm font-medium text-[#6b5138] hover:border-[#8b5a2b] hover:bg-[#ede3d2] hover:text-[#34261a] transition">
                                        <Image size={18} />
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
                                <p className="rounded-xl bg-rose-50 border border-rose-300 p-2.5 text-xs font-semibold text-rose-800 leading-snug">
                                    {error}
                                </p>
                            )}

                            <div className="flex gap-2.5 pt-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 rounded-full border border-[#c4ab89] bg-[#fbf6ee] py-2 text-sm font-semibold text-[#593e25] hover:bg-[#ede3d2] transition"
                                >
                                    {t('report.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={sending || !message.trim()}
                                    className="flex-1 flex items-center justify-center gap-1.5 rounded-full bg-[#a84232] py-2 text-sm font-semibold text-white shadow-md hover:bg-[#91372a] disabled:opacity-50 transition"
                                >
                                    <Send size={15} />
                                    <span>{sending ? t('report.sending') : t('report.send')}</span>
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
