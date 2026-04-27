// components/layouts/SideColumn.jsx
function SideColumn() {
    return (
        <aside
            aria-hidden="true"
            className="pointer-events-none hidden md:flex w-24 lg:w-32 xl:w-40 shrink-0 flex-col select-none self-stretch"
        >
            <img
                src="/assets/img/hautecolonne.svg"
                alt=""
                className="w-full block"
                draggable="false"
            />
            <div className="flex-1 w-full bg-[url('/assets/img/millieucolonne2.svg')] bg-repeat-y bg-top bg-[length:100%_auto]" />
            <img
                src="/assets/img/hautecolonne.svg"
                alt=""
                className="w-full block rotate-180"
                draggable="false"
            />
        </aside>
    );
}
export default SideColumn;
