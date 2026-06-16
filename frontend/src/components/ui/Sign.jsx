// components/ui/Sign.jsx
// Props :
//   title        - titre fixe non scrollable
//   children     - contenu scrollable a l'interieur du cadre
//   className    - classes Tailwind supplementaires sur le wrapper
//   top/left/right/bottom - % de recadrage sur le PNG
//   scale        - zoom leger (1 = largeur de colonne)

function Sign({ title, children, className = '', top = '34%', left = '31%', right = '21%', bottom = '22%', scale = 1.06 }) {
    return (
        <div
            className={`relative pointer-events-auto ${className}`}
            style={{
                width: `${scale * 100}%`,
                paddingBottom: `${scale * 100}%`,
                backgroundImage: "url('/assets/img/sign.png')",
                backgroundSize: '100% 100%',
                backgroundRepeat: 'no-repeat',
            }}
        >
            <div className="absolute flex flex-col" style={{ top, left, right, bottom }}>
                {title && (
                    <p className="shrink-0 text-[11px] font-semibold text-amber-900 mb-1 text-center tracking-wide leading-tight">
                        {title}
                    </p>
                )}
                <div className="sign-scroll overflow-y-auto flex-1 min-h-0" style={{ background: 'transparent' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}

export default Sign;



