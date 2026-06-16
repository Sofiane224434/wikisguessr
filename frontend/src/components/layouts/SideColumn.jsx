// components/layouts/SideColumn.jsx
// Accepte une prop `signs` : tableau de nœuds React (composants Sign)
// à afficher dans la zone centrale de la colonne.
function SideColumn({ signs = [] }) {
    return (
        <div
            className="hidden md:flex w-30 lg:w-38 xl:w-46 shrink-0 flex-col select-none self-stretch"
        >
            <img
                src="/assets/img/hautecolonne.svg"
                alt=""
                className="w-full block border-0 shadow-none! rounded-none!"
                style={{ borderRadius: 0, boxShadow: 'none', border: 'none' }}
                draggable="false"
            />
            <div
                className="flex-1 w-full bg-[url('/assets/img/millieucolonne2.svg')] bg-repeat-y bg-top bg-size-[100%_auto] flex flex-col gap-4 items-center py-4 px-1"
            >
                {signs.map((sign, i) => (
                    <div key={i} className="w-full flex justify-center">
                        {sign}
                    </div>
                ))}
            </div>
            <img
                src="/assets/img/hautecolonne.svg"
                alt=""
                className="w-full block rotate-180 border-0 shadow-none! rounded-none!"
                style={{ borderRadius: 0, boxShadow: 'none', border: 'none' }}
                draggable="false"
            />
        </div>
    );
}
export default SideColumn;
