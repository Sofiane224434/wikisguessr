const PRESET_BOTS = [
    { username: 'Alex_Explorer', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Alex_Explorer' },
    { username: 'Sophie_Wiki', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Sophie_Wiki' },
    { username: 'Lucas_Chrono', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Lucas_Chrono' },
    { username: 'Clara_Guess', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Clara_Guess' },
    { username: 'Hugo_Search', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Hugo_Search' },
    { username: 'Emma_Path', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Emma_Path' },
    { username: 'Nathan_Link', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Nathan_Link' },
    { username: 'Camille_Nav', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Camille_Nav' },
    { username: 'Antoine_Sprint', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Antoine_Sprint' },
    { username: 'Léa_Mind', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Lea_Mind' },
    { username: 'Gabriel_Wiki', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Gabriel_Wiki' },
    { username: 'Inès_Atlas', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Ines_Atlas' },
    { username: 'Léo_Vector', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Leo_Vector' },
    { username: 'Manon_Quest', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Manon_Quest' },
    { username: 'Arthur_Track', avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Arthur_Track' }
];

export const getBotParticipants = (realParticipants = [], targetCount = 8) => {
    const existingCount = Array.isArray(realParticipants) ? realParticipants.length : 0;
    if (existingCount >= targetCount) {
        return realParticipants;
    }

    const neededBotsCount = targetCount - existingCount;
    const existingUsernames = new Set(realParticipants.map((p) => String(p.username || '').toLowerCase()));

    const availableBots = PRESET_BOTS.filter((bot) => !existingUsernames.has(bot.username.toLowerCase()));
    const selectedBots = availableBots.slice(0, neededBotsCount).map((bot, index) => ({
        user_id: `bot_${index + 1}`,
        username: bot.username,
        avatar_url: bot.avatar_url,
        isBot: true,
        progress_status: 'playing',
        clicks: 0,
        time_seconds: 0,
        score: 0,
        knowledge_score: null,
        won: false
    }));

    return [...realParticipants, ...selectedBots];
};

export const simulateBotProgression = (participants = [], humanPerformance = {}) => {
    const {
        leadClicks = 0,
        elapsedSeconds = 0,
        leadWon = false,
        leadScore = 500
    } = humanPerformance;

    return participants.map((p) => {
        if (!p.isBot) {
            return p;
        }

        const botSeed = String(p.user_id || p.username).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const botSkillFactor = 0.65 + ((botSeed % 25) / 100); // 0.65 to 0.90 factor of lead performance

        let botClicks = 0;
        let botScore = 0;
        let botWon = false;
        let botStatus = 'playing';

        if (leadWon) {
            // Human lead won: bots stay closely behind
            botClicks = Math.max(1, Math.floor(leadClicks * (1.2 + (botSkillFactor * 0.3))));
            botScore = Math.max(50, Math.floor(leadScore * botSkillFactor));
            botWon = false; // Never beat a winning human player
            botStatus = 'playing';
        } else {
            // Game in progress
            const simulatedClicks = Math.floor(elapsedSeconds / (10 + (botSkillFactor * 10)));
            botClicks = Math.min(simulatedClicks, Math.max(0, leadClicks - 1));
            botScore = Math.floor(Math.max(0, leadScore - 40) * botSkillFactor);
            botWon = false;
            botStatus = 'playing';
        }

        return {
            ...p,
            clicks: botClicks,
            time_seconds: elapsedSeconds,
            score: botScore,
            won: botWon,
            progress_status: botStatus
        };
    });
};
