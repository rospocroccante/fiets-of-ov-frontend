export interface Trip {
  from: string;
  to: string;
}

export function SearchBar({
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  onSubmit,
  onHome,
}: {
  fromValue: string;
  toValue: string;
  onFromChange: (text: string) => void;
  onToChange: (text: string) => void;
  onSubmit: () => void;
  onHome?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <button onClick={onHome} className="text-2xl font-bold text-brand">
        Fiets of OV
      </button>

      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center rounded-full border border-gray-200 bg-white shadow-sm">
          <input
            className="w-40 rounded-l-full px-5 py-3 text-sm outline-none"
            placeholder="From"
            value={fromValue}
            onChange={(e) => onFromChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          />
          <span className="h-6 w-px bg-gray-200" />
          <input
            className="w-40 px-5 py-3 text-sm outline-none"
            placeholder="To"
            value={toValue}
            onChange={(e) => onToChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          />
          <span className="h-6 w-px bg-gray-200" />
          <span className="px-5 py-3 text-sm text-gray-500">Now</span>
          <button
            aria-label="Search"
            onClick={onSubmit}
            className="m-1 flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"
          >
            &#9906;
          </button>
        </div>
      </div>

      <button className="rounded-full border border-gray-200 px-5 py-2 text-sm font-medium">
        Menu &#9776;
      </button>
    </div>
  );
}
