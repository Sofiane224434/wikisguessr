import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SITE_STATE_FILE_PATH = path.resolve(__dirname, '../data/site-state.json');

const DEFAULT_SITE_STATE = {
    offline: false,
    adminCheat: false,
    updatedAt: null,
    updatedBy: null
};

const normalizeState = (value) => {
    if (!value || typeof value !== 'object') {
        return { ...DEFAULT_SITE_STATE };
    }

    return {
        offline: Boolean(value.offline),
        adminCheat: Boolean(value.adminCheat),
        updatedAt: value.updatedAt ? String(value.updatedAt) : null,
        updatedBy: value.updatedBy ? String(value.updatedBy) : null
    };
};

export const readSiteState = () => {
    try {
        if (!fs.existsSync(SITE_STATE_FILE_PATH)) {
            return { ...DEFAULT_SITE_STATE };
        }

        const raw = fs.readFileSync(SITE_STATE_FILE_PATH, 'utf-8');
        const sanitized = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
        const parsed = JSON.parse(sanitized);
        return normalizeState(parsed);
    } catch {
        return { ...DEFAULT_SITE_STATE };
    }
};

export const writeSiteState = ({ offline, adminCheat, updatedBy }) => {
    const currentState = readSiteState();
    const nextState = {
        offline: offline !== undefined ? Boolean(offline) : currentState.offline,
        adminCheat: adminCheat !== undefined ? Boolean(adminCheat) : currentState.adminCheat,
        updatedAt: new Date().toISOString(),
        updatedBy: updatedBy ? String(updatedBy) : null
    };

    fs.writeFileSync(SITE_STATE_FILE_PATH, `${JSON.stringify(nextState, null, 2)}\n`, 'utf-8');
    return nextState;
};
