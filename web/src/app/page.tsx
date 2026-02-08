"use client";

import { useState, useRef, useCallback } from "react";
import { useCoachingData } from "@/hooks/useCoachingData";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { CoachNode, Connection } from "@/lib/types";
import CoachingTreeGraph, { GraphHandle } from "@/components/CoachingTreeGraph";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";

export default function Home() {
  const data = useCoachingData();
  const graphRef = useRef<GraphHandle>(null);
  const isMobile = useMediaQuery("(max-width: 768px)");

  const [selectedCoach, setSelectedCoach] = useState<CoachNode | null>(null);
  const [clickPath, setClickPath] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState<{
    nodes: Set<string>;
    edges: Set<Connection>;
  } | null>(null);

  const handleNodeClick = useCallback((coach: CoachNode) => {
    setSelectedCoach(coach);
    setClickPath([coach.id]);
    setSidebarOpen(true);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedCoach(null);
    setClickPath([]);
    setSidebarOpen(false);
  }, []);

  const handleSidebarConnectionClick = useCallback(
    (coachId: string) => {
      if (!data) return;
      const target = data.nodeMap.get(coachId);
      if (!target) return;
      setClickPath((prev) => [...prev, coachId]);
      setSelectedCoach(target);
      graphRef.current?.zoomToNode(coachId, true);
    },
    [data]
  );

  const handleSidebarClose = useCallback(() => {
    setSelectedCoach(null);
    setClickPath([]);
    setSidebarOpen(false);
  }, []);

  const handleSearchSelect = useCallback(
    (coachId: string, nodes: Set<string>, edges: Set<Connection>) => {
      setClickPath([]);
      setSearchHighlight({ nodes, edges });
      graphRef.current?.zoomToNode(coachId);
    },
    []
  );

  const handleSearchClear = useCallback(() => {
    setSearchHighlight(null);
  }, []);

  const handleResetView = useCallback(() => {
    setSelectedCoach(null);
    setClickPath([]);
    setSidebarOpen(false);
    setSearchHighlight(null);
    graphRef.current?.zoomToFit(500);
  }, []);

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0e17]">
        <p className="text-[#64748b] text-sm">Loading coaching tree...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Header
        data={data}
        onSearchSelect={handleSearchSelect}
        onSearchClear={handleSearchClear}
        onResetView={handleResetView}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <CoachingTreeGraph
          ref={graphRef}
          data={data}
          selectedCoach={selectedCoach}
          clickPath={clickPath}
          searchHighlight={searchHighlight}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
        />

        <Sidebar
          data={data}
          selectedCoach={selectedCoach}
          clickPath={clickPath}
          sidebarOpen={sidebarOpen}
          isMobile={isMobile}
          onConnectionClick={handleSidebarConnectionClick}
          onClose={handleSidebarClose}
        />
      </div>
    </div>
  );
}
