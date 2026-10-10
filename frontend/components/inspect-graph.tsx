"use client";

import {
  Check,
  FileCode2,
  GitBranch,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { type PointerEvent, useId, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { inspectEdges, inspectNodes } from "@/lib/inspect-graph";

type Point = { x: number; y: number };

export function InspectGraph() {
  const markerId = useId();
  const [selected, setSelected] = useState("task");
  const [nodes, setNodes] = useState(inspectNodes);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const drag = useRef<{
    id?: string;
    start: Point;
    origin: Point;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const selectedNode = nodes.find((node) => node.id === selected);
  const selectedEdge = inspectEdges.find((edge) => edge.id === selected);
  const properties = selectedNode?.properties ?? {
    From: nodes.find((node) => node.id === selectedEdge?.from)?.title,
    To: nodes.find((node) => node.id === selectedEdge?.to)?.title,
  };

  function point(event: PointerEvent<SVGSVGElement>) {
    const value = event.currentTarget.createSVGPoint();
    value.x = event.clientX;
    value.y = event.clientY;
    return value.matrixTransform(event.currentTarget.getScreenCTM()?.inverse());
  }

  function startDrag(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || event.isPrimary === false) return;
    const target = event.target as Element;
    if (target.closest("[data-edge]")) return;
    const id =
      target.closest("[data-node]")?.getAttribute("data-node") ?? undefined;
    const node = nodes.find((node) => node.id === id);
    drag.current = {
      id,
      start: point(event),
      origin: node ?? pan,
      moved: false,
    };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    const active = drag.current;
    if (!active) return;
    const current = point(event);
    const dx = current.x - active.start.x;
    const dy = current.y - active.start.y;
    if (Math.hypot(dx, dy) < 3 && !active.moved) return;
    active.moved = true;
    if (active.id) {
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === active.id
            ? {
                ...node,
                x: active.origin.x + dx / zoom,
                y: active.origin.y + dy / zoom,
              }
            : node,
        ),
      );
    } else {
      setPan({ x: active.origin.x + dx, y: active.origin.y + dy });
    }
  }

  function endDrag(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    suppressClick.current = drag.current.moved;
    if (!drag.current.moved && drag.current.id) setSelected(drag.current.id);
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function changeZoom(next: number) {
    const value = Math.min(2, Math.max(0.6, Math.round(next * 100) / 100));
    setPan(({ x, y }) => ({
      x: 200 - ((200 - x) * value) / zoom,
      y: 140 - ((140 - y) * value) / zoom,
    }));
    setZoom(value);
  }

  function reset() {
    setNodes(inspectNodes);
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setSelected("task");
  }

  function select(id: string) {
    if (!suppressClick.current) setSelected(id);
    suppressClick.current = false;
  }

  return (
    <div
      className="inspect-graph"
      role="group"
      aria-label="Interactive memory graph"
    >
      <div className="graph-toolbar">
        <span>
          <Logo name="neo4j" size={20} /> Task graph
        </span>
        <div role="group" aria-label="Graph view controls">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom <= 0.6}
            onClick={() => changeZoom(zoom - 0.2)}
          >
            <Minus size={16} />
          </button>
          <output aria-label="Graph zoom">{Math.round(zoom * 100)}%</output>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom >= 2}
            onClick={() => changeZoom(zoom + 0.2)}
          >
            <Plus size={16} />
          </button>
          <button type="button" aria-label="Reset graph" onClick={reset}>
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
      <svg
        className="inspect-canvas"
        viewBox="0 0 400 280"
        role="group"
        aria-label="Repository, task, and attempt nodes. Drag a node to move it, or drag the background to pan."
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6" fill="currentColor" />
          </marker>
        </defs>
        <g
          className="graph-scene"
          transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}
        >
          {inspectEdges.map((edge) => {
            const from = nodes.find((node) => node.id === edge.from);
            const to = nodes.find((node) => node.id === edge.to);
            if (!from || !to) return null;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const distance = Math.hypot(dx, dy);
            if (distance < 62) return null;
            const line = {
              x1: from.x + (dx / distance) * 28,
              y1: from.y + (dy / distance) * 28,
              x2: to.x - (dx / distance) * 31,
              y2: to.y - (dy / distance) * 31,
            };
            const x = (from.x + to.x) / 2;
            const y = (from.y + to.y) / 2;
            return (
              <g
                key={edge.id}
                data-edge={edge.id}
                className="inspect-edge"
                role="button"
                tabIndex={0}
                aria-label={`${from.label} ${edge.type} ${to.label}`}
                aria-pressed={selected === edge.id}
                onClick={() => select(edge.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(edge.id);
                  }
                }}
              >
                <line {...line} className="edge-hit" />
                <line
                  {...line}
                  className="edge-line"
                  markerEnd={`url(#${markerId})`}
                />
                <rect x={x - 34} y={y - 10} width="68" height="20" rx="4" />
                <text x={x} y={y + 4} textAnchor="middle">
                  {edge.label}
                </text>
              </g>
            );
          })}
          {nodes.map((node) => {
            const Icon =
              node.id === "repository"
                ? GitBranch
                : node.id === "task"
                  ? FileCode2
                  : node.result === "passed"
                    ? Check
                    : X;
            return (
              <g
                key={node.id}
                data-node={node.id}
                data-kind={node.result ?? node.kind.toLowerCase()}
                transform={`translate(${node.x} ${node.y})`}
                className="inspect-node"
                role="button"
                tabIndex={0}
                aria-label={`Inspect ${node.label}`}
                aria-pressed={selected === node.id}
                onClick={() => select(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(node.id);
                  }
                }}
              >
                <circle r="25" />
                <Icon
                  x={-10}
                  y={-10}
                  width={20}
                  height={20}
                  aria-hidden="true"
                />
                <text y="44" textAnchor="middle">
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <p className="graph-hint">Select to inspect · Drag to move</p>
      <div
        key={selected}
        className="graph-properties"
        role="region"
        aria-label="Selected graph record"
        tabIndex={0}
        aria-live="polite"
      >
        <div className="graph-selection-type">
          <span>{selectedNode?.kind ?? "Relationship"}</span>
          {selectedNode?.result ? (
            <span className={`status status-${selectedNode.result}`}>
              Check {selectedNode.result}
            </span>
          ) : null}
        </div>
        <h4>{selectedNode?.title ?? selectedEdge?.type}</h4>
        <dl>
          {Object.entries(properties)
            .filter(([, value]) => value != null)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
      </div>
    </div>
  );
}
