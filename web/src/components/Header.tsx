"use client";

import { ProcessedData, Connection } from "@/lib/types";
import SearchBar from "./SearchBar";

interface Props {
  data: ProcessedData;
  onSearchSelect: (coachId: string, nodes: Set<string>, edges: Set<Connection>) => void;
  onSearchClear: () => void;
  onResetView: () => void;
}

export default function Header({
  data,
  onSearchSelect,
  onSearchClear,
  onResetView,
}: Props) {
  return (
    <header className="px-7 bg-gradient-to-b from-[#111827] to-[#0f1523] border-b border-[#1e2737] shrink-0 max-md:px-4">
      <div className="flex items-center justify-between py-3.5 max-md:flex-col max-md:items-stretch max-md:gap-2 max-md:py-2.5">
        <div>
          <h1 className="text-[1.35rem] font-bold text-white tracking-tight max-md:text-lg">
            NFL Coaching Tree
          </h1>
          <p className="text-[0.8rem] text-[#64748b] mt-0.5 tracking-wide max-md:text-[0.72rem]">
            Mapping the mentorship lineage of every current head coach
          </p>
        </div>
        <div className="flex items-center gap-4 max-md:gap-2.5">
          <div className="max-md:flex-1">
            <SearchBar
              data={data}
              onSelect={onSearchSelect}
              onClear={onSearchClear}
            />
          </div>
          <button
            onClick={onResetView}
            className="px-4 py-1.5 bg-[#1a2234] border border-[#2a3548] text-[#d1d5db] rounded-md text-[0.8rem] cursor-pointer hover:bg-[#2a3548] hover:border-[#3b4a63] transition-colors"
          >
            Reset View
          </button>
        </div>
      </div>
    </header>
  );
}
