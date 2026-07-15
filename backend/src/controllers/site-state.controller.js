import { readSiteState, writeSiteState } from '../services/site-state.service.js';

export const getSiteState = (_req, res) => {
    return res.json({ state: readSiteState() });
};

export const updateSiteOfflineMode = (req, res) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acces admin requis' });
    }

    const offline = Boolean(req.body?.offline);
    const state = writeSiteState({
        offline,
        updatedBy: req.user.username || req.user.email || String(req.user.id || '')
    });

    return res.json({ state });
};
