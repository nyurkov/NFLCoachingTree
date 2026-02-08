"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { CoachNode, Connection } from "@/lib/types";
import { getFullTree } from "@/lib/graph";
import { ProcessedData } from "@/lib/types";

interface Props {
  data: ProcessedData;
  onSelect: (coachId: string, nodes: Set<string>, edges: Set<Connection>) => void;
  onClear: () => void;
}

export default function SearchBar({ data, onSelect, onClear }: Props) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = query.trim()
    ? data.nodes
        .filter((n) =>
          n.name.toLowerCase().includes(query.trim().toLowerCase())
        )
        .slice(0, 8)
    : [];

  const selectResult = useCallback(
    (coach: CoachNode) => {
      setQuery(coach.name);
      setOpen(false);
      setActiveIdx(-1);

      const treeNodes = getFullTree(
        coach.id,
        data.mAdj,
        data.pAdj,
        data.nodeMap
      );
      const treeEdges = new Set<Connection>();
      for (const e of data.edges) {
        if (treeNodes.has(e.source) && treeNodes.has(e.target)) {
          treeEdges.add(e);
        }
      }

      onSelect(coach.id, treeNodes, treeEdges);
    },
    [data, onSelect]
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    setOpen(false);
    setActiveIdx(-1);
    onClear();
  }, [onClear]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  function handleInput(val: string) {
    setQuery(val);
    setActiveIdx(-1);
    if (val.trim()) {
      setOpen(true);
    } else {
      setOpen(false);
      onClear();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!matches.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((prev) => Math.min(prev + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      selectResult(matches[activeIdx]);
    } else if (e.key === "Escape") {
      clearSearch();
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search coaches..."
        autoComplete="off"
        className="px-3 py-1.5 bg-[#1a2234] border border-[#2a3548] text-[#e2e8f0] rounded-md text-[0.8rem] w-[200px] outline-none transition-all placeholder:text-[#64748b] focus:border-[#3b82f6] focus:w-[240px] max-md:w-full max-md:focus:w-full"
      />

      {open && matches.length > 0 && (
        <ul className="absolute top-full left-0 right-0 mt-1 bg-[rgba(14,20,33,0.97)] border border-[#2a3548] rounded-md list-none p-0 py-1 max-h-80 overflow-y-auto z-[200] shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md min-w-[240px]">
          {matches.map((m, i) => (
            <li
              key={m.id}
              onClick={() => selectResult(m)}
              onMouseEnter={() => setActiveIdx(i)}
              className={`px-3 py-2 text-[0.8rem] text-[#e2e8f0] cursor-pointer transition-colors ${
                i === activeIdx ? "bg-[rgba(59,130,246,0.15)]" : ""
              } hover:bg-[rgba(59,130,246,0.15)]`}
            >
              {m.name}
              {m.current_team && (
                <span className="block text-[0.7rem] text-[#64748b] mt-px">
                  {m.current_team}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
