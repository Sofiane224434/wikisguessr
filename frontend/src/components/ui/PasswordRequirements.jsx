import { useMemo } from 'react';
import { Check, ShieldCheck, ShieldAlert, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const checkPasswordRules = (password = '', confirmPassword) => {
    const hasMinLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(password);
    const matches = confirmPassword !== undefined
        ? (Boolean(password) && password === confirmPassword)
        : true;

    const score = [hasMinLength, hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
    const isRobust = score === 5 && (confirmPassword === undefined || matches);

    return {
        hasMinLength,
        hasUpper,
        hasLower,
        hasNumber,
        hasSpecial,
        matches,
        score,
        isRobust
    };
};

export function PasswordRequirements({ password = '', confirmPassword, showAlways = false }) {
    const { t } = useTranslation();
    const rules = useMemo(() => checkPasswordRules(password, confirmPassword), [password, confirmPassword]);

    if (!showAlways && !password && !confirmPassword) {
        return null;
    }

    const getStrengthMeta = (score) => {
        if (score <= 1) return { label: t('login.password_rules.strength_weak', { defaultValue: 'Faible' }), colorClass: 'strength-weak', width: '20%' };
        if (score <= 3) return { label: t('login.password_rules.strength_medium', { defaultValue: 'Moyen' }), colorClass: 'strength-medium', width: '60%' };
        if (score === 4) return { label: t('login.password_rules.strength_good', { defaultValue: 'Bon' }), colorClass: 'strength-good', width: '80%' };
        return { label: t('login.password_rules.strength_strong', { defaultValue: 'Robuste' }), colorClass: 'strength-strong', width: '100%' };
    };

    const strength = getStrengthMeta(rules.score);

    const criteria = [
        { key: 'min_length', label: t('login.password_rules.min_length', { defaultValue: '8 caractères minimum' }), ok: rules.hasMinLength },
        { key: 'uppercase', label: t('login.password_rules.uppercase', { defaultValue: '1 majuscule (A-Z)' }), ok: rules.hasUpper },
        { key: 'lowercase', label: t('login.password_rules.lowercase', { defaultValue: '1 minuscule (a-z)' }), ok: rules.hasLower },
        { key: 'number', label: t('login.password_rules.number', { defaultValue: '1 chiffre (0-9)' }), ok: rules.hasNumber },
        { key: 'special', label: t('login.password_rules.special', { defaultValue: '1 caractère spécial (!@#...)' }), ok: rules.hasSpecial }
    ];

    return (
        <div className="pwd-requirements-box" aria-live="polite">
            <div className="pwd-strength-header">
                <span className="pwd-strength-title">
                    {rules.isRobust ? (
                        <ShieldCheck size={16} className="text-emerald-500" aria-hidden="true" />
                    ) : rules.score >= 3 ? (
                        <Shield size={16} className="text-amber-500" aria-hidden="true" />
                    ) : (
                        <ShieldAlert size={16} className="text-rose-500" aria-hidden="true" />
                    )}
                    <span>{t('login.password_rules.title', { defaultValue: 'Exigences de sécurité :' })}</span>
                </span>
                {password && (
                    <span className={`pwd-strength-badge ${strength.colorClass}`}>
                        {strength.label}
                    </span>
                )}
            </div>

            {password && (
                <div className="pwd-meter-bar-track">
                    <div
                        className={`pwd-meter-bar-fill ${strength.colorClass}`}
                        style={{ width: strength.width }}
                    />
                </div>
            )}

            <ul className="pwd-criteria-grid">
                {criteria.map((item) => (
                    <li
                        key={item.key}
                        className={`pwd-criterion-item ${item.ok ? 'is-valid' : 'is-pending'}`}
                    >
                        <span className="pwd-criterion-icon">
                            {item.ok ? (
                                <Check size={13} strokeWidth={3} aria-hidden="true" />
                            ) : (
                                <span className="pwd-bullet" aria-hidden="true" />
                            )}
                        </span>
                        <span>{item.label}</span>
                    </li>
                ))}
            </ul>

            {confirmPassword !== undefined && confirmPassword.length > 0 && (
                <div className={`pwd-match-badge ${rules.matches ? 'is-valid' : 'is-mismatch'}`}>
                    <span className="pwd-criterion-icon">
                        <Check size={13} strokeWidth={3} aria-hidden="true" />
                    </span>
                    <span>
                        {rules.matches
                            ? t('login.password_rules.match', { defaultValue: 'Les mots de passe correspondent' })
                            : t('login.password_rules.mismatch', { defaultValue: 'Les mots de passe ne correspondent pas' })}
                    </span>
                </div>
            )}
        </div>
    );
}

export default PasswordRequirements;
