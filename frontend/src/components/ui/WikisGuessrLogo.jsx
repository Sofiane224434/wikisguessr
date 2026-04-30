// components/ui/WikisGuessrLogo.jsx
import { useEffect, useRef } from 'react';
import Vivus from 'vivus';
import WSvg from '../../assets/icons/wikisguessr.svg?react';

/**
 * Logo "WikisGuessr" : un W calligraphique animé via Vivus + le texte "ikisGuessr".
 *
 * Props :
 *  - size       : 'sm' | 'md' | 'lg' | 'xl' (défaut 'md')
 *  - color      : couleur CSS du logo (défaut '#000000') — propagée via currentColor
 *  - className  : classes additionnelles sur le wrapper
 *  - withText   : affiche "ikisGuessr" à côté (défaut true)
 *  - duration   : durée de l'animation Vivus (défaut 250)
 */

const SIZE_PRESETS = {
    sm: { height: 'h-12 md:h-16', text: 'text-lg md:text-xl', mlNeg: '-ml-4 md:-ml-6', ty: 'translate-y-0.5 md:translate-y-1' },
    md: { height: 'h-24 md:h-32 lg:h-40', text: 'text-2xl md:text-3xl lg:text-4xl', mlNeg: '-ml-8 md:-ml-12 lg:-ml-16', ty: 'translate-y-1 md:translate-y-2' },
    lg: { height: 'h-32 md:h-44 lg:h-56', text: 'text-3xl md:text-5xl lg:text-6xl', mlNeg: '-ml-10 md:-ml-16 lg:-ml-20', ty: 'translate-y-2 md:translate-y-3' },
    xl: { height: 'h-44 md:h-60 lg:h-72', text: 'text-5xl md:text-6xl lg:text-7xl', mlNeg: '-ml-14 md:-ml-20 lg:-ml-28', ty: 'translate-y-3 md:translate-y-4' },
};

function WikisGuessrLogo({
    size = 'md',
    color = '#000000',
    className = '',
    withText = true,
    duration = 250,
}) {
    const svgRef = useRef(null);
    const preset = SIZE_PRESETS[size] ?? SIZE_PRESETS.md;

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        svg.classList.remove('is-done');
        const vivus = new Vivus(svg, {
            type: 'oneByOne',
            duration,
            start: 'autostart',
            animTimingFunction: Vivus.EASE,
        }, () => svg.classList.add('is-done'));
        return () => { try { vivus.destroy(); } catch { /* ignore */ } };
    }, [duration]);

    return (
        <div className={`flex items-center ${className}`} style={{ color }}>
            <div className={`${preset.height} aspect-square shrink-0 relative z-10`}>
                <WSvg ref={svgRef} className="w-logo" aria-label="W" />
            </div>
            {withText && (
                <span className={`font-cinzel ${preset.text} font-bold tracking-tight ${preset.mlNeg} ${preset.ty}`}>
                    ikisGuessr
                </span>
            )}
        </div>
    );
}

export default WikisGuessrLogo;


