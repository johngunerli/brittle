'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { NoteMeta } from '@/lib/github';

interface SimNode { x: number; y: number; vx: number; vy: number }
interface SimEdge { a: number; b: number }

const REPULSION = 4000;
const SPRING_K  = 0.04;
const SPRING_LEN = 130;
const CENTER_G  = 0.015;
const DAMPING   = 0.82;

function tick(nodes: SimNode[], edges: SimEdge[]) {
  // Center gravity
  for (const n of nodes) {
    n.vx -= n.x * CENTER_G;
    n.vy -= n.y * CENTER_G;
  }

  // Node repulsion (O(n²), fine for personal use < 300 notes)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const d2 = dx * dx + dy * dy + 1;
      const f  = REPULSION / d2;
      const d  = Math.sqrt(d2);
      nodes[i].vx -= (dx / d) * f;
      nodes[i].vy -= (dy / d) * f;
      nodes[j].vx += (dx / d) * f;
      nodes[j].vy += (dy / d) * f;
    }
  }

  // Spring attraction
  for (const e of edges) {
    const a = nodes[e.a];
    const b = nodes[e.b];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d  = Math.sqrt(dx * dx + dy * dy) || 1;
    const f  = (d - SPRING_LEN) * SPRING_K;
    a.vx += (dx / d) * f;
    a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f;
    b.vy -= (dy / d) * f;
  }

  // Apply with damping
  for (const n of nodes) {
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x  += n.vx;
    n.y  += n.vy;
  }
}

interface Props {
  notes: NoteMeta[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onClose: () => void;
}

export default function Graph({ notes, selectedSlug, onSelect, onClose }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const nodesRef   = useRef<SimNode[]>([]);
  const edgesRef   = useRef<SimEdge[]>([]);
  const hoveredRef = useRef<number>(-1);
  const rafRef     = useRef<number>(0);
  const ticksRef   = useRef(0);

  // Build simulation data whenever notes change
  useEffect(() => {
    const slugIndex = new Map(notes.map((n, i) => [n.slug, i]));

    nodesRef.current = notes.map(() => ({
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 200,
      vx: 0, vy: 0,
    }));

    edgesRef.current = notes.flatMap((n, i) =>
      n.links
        .map((slug) => slugIndex.get(slug))
        .filter((j): j is number => j !== undefined && j !== i)
        .map((j) => ({ a: i, b: j }))
    );

    ticksRef.current = 0;
  }, [notes]);

  // Draw loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx   = canvas.getContext('2d')!;
    const W     = canvas.width;
    const H     = canvas.height;
    const cx    = W / 2;
    const cy    = H / 2;
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const selIdx = notes.findIndex((n) => n.slug === selectedSlug);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, W, H);

    // Edges
    ctx.lineWidth = 1;
    for (const e of edges) {
      const a = nodes[e.a];
      const b = nodes[e.b];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.strokeStyle = '#2d3748';
      ctx.moveTo(cx + a.x, cy + a.y);
      ctx.lineTo(cx + b.x, cy + b.y);
      ctx.stroke();
    }

    // Nodes + labels
    for (let i = 0; i < nodes.length; i++) {
      const n    = nodes[i];
      const meta = notes[i];
      const x    = cx + n.x;
      const y    = cy + n.y;
      const r    = 5;
      const isSelected = i === selIdx;
      const isHovered  = i === hoveredRef.current;

      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 7 : r, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#60a5fa' : isHovered ? '#e2e8f0' : '#718096';
      ctx.fill();

      if (isSelected || isHovered || notes.length < 40) {
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          (meta.title !== 'Untitled' ? meta.title : meta.slug).slice(0, 28),
          x,
          y - r - 4
        );
      }
    }
  }, [notes, selectedSlug]);

  useEffect(() => {
    function animate() {
      // Run simulation for first 200 ticks, then cool down
      if (ticksRef.current < 200) {
        tick(nodesRef.current, edgesRef.current);
        ticksRef.current++;
      }
      draw();
      rafRef.current = requestAnimationFrame(animate);
    }
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // Resize canvas to fill container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => ro.disconnect();
  }, []);

  // Mouse interactions
  const getHovered = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const mx     = e.clientX - rect.left - canvas.width  / 2;
    const my     = e.clientY - rect.top  - canvas.height / 2;
    return nodesRef.current.findIndex((n) => {
      const dx = n.x - mx;
      const dy = n.y - my;
      return dx * dx + dy * dy < 64;
    });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    hoveredRef.current = getHovered(e);
  }, [getHovered]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const idx = getHovered(e);
    if (idx >= 0 && notes[idx]) {
      onSelect(notes[idx].slug);
      onClose();
    }
  }, [getHovered, notes, onSelect, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0f1117] flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 flex-shrink-0">
        <span className="text-sm text-gray-400">Graph view — {notes.length} notes</span>
        <button
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Close ×
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="flex-1 w-full cursor-pointer"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />
      <div className="px-5 py-2 border-t border-gray-800 text-xs text-gray-600 flex-shrink-0">
        Click a node to open the note
      </div>
    </div>
  );
}
