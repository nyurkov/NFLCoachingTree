"use client";

import { useMemo, useRef } from "react";
import { motion, AnimatePresence, PanInfo, useDragControls } from "framer-motion";
import { CoachNode, Connection, ProcessedData } from "@/lib/types";
import { ordinal } from "@/lib/graph";

interface Props {
  data: ProcessedData;
  selectedCoach: CoachNode | null;
  clickPath: string[];
  sidebarOpen: boolean;
  isMobile: boolean;
  onConnectionClick: (coachId: string) => void;
  onClose: () => void;
}

export default function Sidebar({
  data,
  selectedCoach,
  clickPath,
  sidebarOpen,
  isMobile,
  onConnectionClick,
  onClose,
}: Props) {
  const dragRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  // BUG FIX: Use data.edges (coaching_tree only), NOT data.allEdges
  const connections = useMemo(() => {
    if (!selectedCoach) return [];
    return data.edges.filter(
      (e) => e.source === selectedCoach.id || e.target === selectedCoach.id
    );
  }, [data.edges, selectedCoach]);

  const statsText = `${data.nodes.length} coaches \u00B7 ${data.edges.length} connections`;

  const sidebarContent = (
    <>
      <div className="flex-1 overflow-y-auto sidebar-scroll p-5 max-md:p-3 max-md:pt-1">
        {selectedCoach ? (
          <div className="relative">
            <button
              onClick={onClose}
              className="absolute -top-0.5 -right-1 bg-transparent border-none text-[#64748b] text-xl cursor-pointer p-1 px-2 rounded hover:text-[#e2e8f0] hover:bg-white/[0.06] transition-colors"
            >
              &times;
            </button>

            <h3 className="text-[1.15rem] font-bold text-white mb-2.5 pr-6">
              {selectedCoach.name}
            </h3>

            {selectedCoach.current_team && (
              <div
                className="inline-block px-3 py-1 bg-white/[0.06] border-l-[3px] rounded text-[0.8rem] font-semibold text-[#94a3b8] mb-2"
                style={{
                  borderLeftColor:
                    data.teamColors[selectedCoach.current_team] || "#6b7280",
                }}
              >
                {selectedCoach.current_team}
              </div>
            )}

            <div className="text-[0.8rem] text-[#64748b] mb-2">
              {selectedCoach.is_current_hc
                ? "Current Head Coach"
                : `${ordinal(selectedCoach.layer)} generation`}
            </div>

            <a
              href={`https://en.wikipedia.org/wiki/${selectedCoach.name.replace(/ /g, "_")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[0.75rem] text-[#60a5fa] no-underline mb-4 opacity-80 hover:opacity-100 hover:underline transition-opacity"
            >
              Wikipedia ↗
            </a>

            <div>
              <h4 className="text-[0.75rem] text-[#64748b] uppercase tracking-wider mb-2.5 pb-1.5 border-b border-[#1e2737]">
                Connections
              </h4>
              <ul className="list-none p-0">
                {connections.map((e, i) => {
                  const otherId =
                    e.source === selectedCoach.id ? e.target : e.source;
                  const other = data.nodeMap.get(otherId);
                  if (!other) return null;

                  const isMentor = e.target === selectedCoach.id;
                  const direction = isMentor ? "Mentored by" : "Mentor of";
                  const inTree = data.nodeMap.has(otherId);
                  const inPath = clickPath.includes(otherId);

                  return (
                    <li
                      key={`${otherId}-${i}`}
                      onClick={
                        inTree ? () => onConnectionClick(otherId) : undefined
                      }
                      className={`text-[0.8rem] px-2.5 py-2 mb-1 rounded-md border-l-[3px] transition-colors ${
                        inPath
                          ? "bg-[rgba(245,158,11,0.1)] border-l-[#f59e0b]"
                          : "bg-white/[0.03] border-l-[#2a3548]"
                      } ${
                        inTree
                          ? "cursor-pointer hover:bg-white/[0.06] hover:border-l-[#3b82f6]"
                          : ""
                      }`}
                    >
                      <span className="block text-[0.68rem] text-[#64748b] uppercase tracking-wide mb-0.5">
                        {direction}
                      </span>
                      <span
                        className={`font-semibold ${
                          inPath ? "text-[#f59e0b]" : "text-[#e2e8f0]"
                        }`}
                      >
                        {other.name}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : (
          <div className={isMobile ? "hidden" : ""}>
            <h3 className="text-base text-white mb-2.5">Coach Details</h3>
            <p className="text-[0.82rem] text-[#64748b] mb-1.5 leading-relaxed">
              Click on a coach to view their details and connections.
            </p>
            <p className="text-[#4b5e7a] text-[0.78rem]">
              Hover over nodes to highlight full coaching lineages.
            </p>
          </div>
        )}
      </div>
      <div className="px-5 py-2.5 border-t border-[#1e2737] text-[0.72rem] text-[#64748b] tracking-wide">
        {statsText}
      </div>
    </>
  );

  // ── Mobile: Framer Motion bottom sheet ──
  if (isMobile) {
    return (
      <AnimatePresence>
        {sidebarOpen && selectedCoach && (
          <motion.div
            ref={dragRef}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_: unknown, info: PanInfo) => {
              if (info.offset.y > 100 || info.velocity.y > 500) {
                onClose();
              }
            }}
            className="absolute bottom-0 left-0 right-0 max-h-[55vh] bg-[#111827] border-t border-[#1e2737] rounded-t-[14px] shadow-[0_-4px_24px_rgba(0,0,0,0.5)] z-50 flex flex-col"
          >
            {/* Drag handle */}
            <div
              className="flex justify-center pt-2.5 pb-1 sidebar-drag-handle"
              onPointerDown={(event) => dragControls.start(event)}
            >
              <div className="w-9 h-1 bg-[#2a3548] rounded-full" />
            </div>
            {sidebarContent}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // ── Desktop: fixed 320px right panel ──
  return (
    <div className="w-80 bg-[#111827] border-l border-[#1e2737] flex flex-col shrink-0">
      {sidebarContent}
    </div>
  );
}
