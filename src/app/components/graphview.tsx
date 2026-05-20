import { Network } from "lucide-react";
import { useEffect, useRef } from "react";
import { actions } from "../state/actions.ts";
import { useApp } from "../state/store.ts";

type SimNode = {
  id: number;
  title: string;
  icon: string;
  degree: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const nodeRadius = (degree: number): number => 5 + Math.min(degree, 14) * 1.7;

// A canvas force-directed view of the whole knowledge graph. The simulation
// lives entirely in refs / closure state so React re-renders never disturb it.
export const GraphView = () => {
  const { graph, activeId, graphMode } = useApp();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<number | null>(null);
  activeRef.current = activeId;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !graph || graph.nodes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const count = graph.nodes.length;
    const nodes: SimNode[] = graph.nodes.map((n, i) => {
      const angle = (i / count) * Math.PI * 2;
      const r = 100 + (i % 9) * 24;
      return {
        ...n,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        vx: 0,
        vy: 0,
      };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edges = graph.edges
      .map((e) => ({ s: byId.get(e.source), t: byId.get(e.target) }))
      .filter((e): e is { s: SimNode; t: SimNode } => Boolean(e.s) && Boolean(e.t));

    const view = { x: 0, y: 0, scale: 1 };
    let alpha = 1;
    let hover: SimNode | null = null;
    let drag: SimNode | null = null;
    let panning = false;
    let moved = false;
    let last = { x: 0, y: 0 };
    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.max(1, rect.width * dpr);
      canvas.height = Math.max(1, rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const center = () => ({
      x: canvas.clientWidth / 2 + view.x,
      y: canvas.clientHeight / 2 + view.y,
    });
    const toWorld = (sx: number, sy: number) => {
      const c = center();
      return { x: (sx - c.x) / view.scale, y: (sy - c.y) / view.scale };
    };
    const pick = (sx: number, sy: number): SimNode | null => {
      const w = toWorld(sx, sy);
      let best: SimNode | null = null;
      let bestD = Infinity;
      for (const n of nodes) {
        const dx = n.x - w.x;
        const dy = n.y - w.y;
        const d = dx * dx + dy * dy;
        const hit = nodeRadius(n.degree) + 6;
        if (d < hit * hit && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    };

    const style = (token: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(token).trim();

    const step = () => {
      if (alpha > 0.02) {
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          if (!a) continue;
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            if (!b) continue;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy || 0.01;
            const d = Math.sqrt(d2);
            const f = (2600 / d2) * alpha;
            const fx = (dx / d) * f;
            const fy = (dy / d) * f;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }
        }
        for (const e of edges) {
          const dx = e.t.x - e.s.x;
          const dy = e.t.y - e.s.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const f = (d - 96) * 0.015;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          e.s.vx += fx;
          e.s.vy += fy;
          e.t.vx -= fx;
          e.t.vy -= fy;
        }
        for (const n of nodes) {
          n.vx += -n.x * 0.0024;
          n.vy += -n.y * 0.0024;
          n.vx *= 0.84;
          n.vy *= 0.84;
          if (n !== drag) {
            n.x += n.vx;
            n.y += n.vy;
          }
        }
        alpha *= 0.99;
      }

      const accent = style("--accent") || "#6366f1";
      const fg = style("--fg") || "#1c1c1c";
      const muted = style("--fg-muted") || "#8a8a8a";
      const edgeColor = style("--graph-edge") || "rgba(120,120,140,0.35)";

      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      const c = center();
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(view.scale, view.scale);

      ctx.lineWidth = 1;
      ctx.strokeStyle = edgeColor;
      for (const e of edges) {
        const lit = hover && (e.s === hover || e.t === hover);
        ctx.strokeStyle = lit ? accent : edgeColor;
        ctx.globalAlpha = lit ? 0.9 : 1;
        ctx.beginPath();
        ctx.moveTo(e.s.x, e.s.y);
        ctx.lineTo(e.t.x, e.t.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (const n of nodes) {
        const r = nodeRadius(n.degree);
        const isActive = n.id === activeRef.current;
        const isHover = n === hover;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isActive || isHover ? accent : fg;
        ctx.globalAlpha = isActive || isHover ? 1 : 0.82;
        ctx.fill();
        if (isActive) {
          ctx.globalAlpha = 1;
          ctx.lineWidth = 2;
          ctx.strokeStyle = accent;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (view.scale > 0.55 || isHover || isActive) {
          ctx.fillStyle = isHover || isActive ? fg : muted;
          ctx.font = `${isHover ? 600 : 400} ${11 / view.scale + 1}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(`${n.icon ? `${n.icon} ` : ""}${n.title || "Untitled"}`, n.x, n.y - r - 5);
        }
      }
      ctx.restore();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    // --- pointer interaction ----------------------------------------------

    const localPoint = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: MouseEvent) => {
      const p = localPoint(e);
      moved = false;
      last = p;
      const node = pick(p.x, p.y);
      if (node) {
        drag = node;
        alpha = Math.max(alpha, 0.4);
      } else {
        panning = true;
      }
    };
    const onMove = (e: MouseEvent) => {
      const p = localPoint(e);
      if (drag) {
        const w = toWorld(p.x, p.y);
        drag.x = w.x;
        drag.y = w.y;
        drag.vx = 0;
        drag.vy = 0;
        moved = true;
      } else if (panning) {
        view.x += p.x - last.x;
        view.y += p.y - last.y;
        moved = true;
      } else {
        hover = pick(p.x, p.y);
        canvas.style.cursor = hover ? "pointer" : "default";
      }
      last = p;
    };
    const onUp = (e: MouseEvent) => {
      const p = localPoint(e);
      if (drag && !moved) void actions.openPage(drag.id);
      else if (!drag && !moved) {
        const node = pick(p.x, p.y);
        if (node) void actions.openPage(node.id);
      }
      drag = null;
      panning = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = localPoint(e);
      const before = toWorld(p.x, p.y);
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      view.scale = Math.min(3, Math.max(0.25, view.scale * factor));
      const c = center();
      view.x = p.x - c.x + view.x - before.x * view.scale;
      view.y = p.y - c.y + view.y - before.y * view.scale;
    };

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [graph]);

  const modeToggle = (
    <div className="graph-mode seg-control">
      <button
        type="button"
        data-on={graphMode === "global"}
        onClick={() => void actions.setGraphMode("global")}
      >
        Global
      </button>
      <button
        type="button"
        data-on={graphMode === "local"}
        disabled={activeId === null}
        onClick={() => void actions.setGraphMode("local")}
      >
        Local
      </button>
    </div>
  );

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="graph" ref={wrapRef}>
        <div className="graph-empty">
          <Network size={28} />
          <h2>{graphMode === "local" ? "Nothing linked here yet" : "The graph is empty"}</h2>
          <p>Connect pages with [[wiki links]] to grow the graph.</p>
        </div>
        <div className="graph-legend">{modeToggle}</div>
      </div>
    );
  }

  return (
    <div className="graph" ref={wrapRef}>
      <canvas ref={canvasRef} />
      <div className="graph-legend">
        {modeToggle}
        <span>{graph.nodes.length} pages</span>
        <span>·</span>
        <span>{graph.edges.length} links</span>
        <span className="graph-hint">drag · scroll · click a node</span>
      </div>
    </div>
  );
};
