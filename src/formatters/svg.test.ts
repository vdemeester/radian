import { describe, it, expect } from "vitest";
import {
  svgBarChart,
  svgLineChart,
  svgDonutChart,
  svgHeatmap,
  escapeHtml,
} from "./svg.js";

describe("escapeHtml", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml('<script>"hello" & \'world\'')).toBe(
      "&lt;script&gt;&quot;hello&quot; &amp; &#39;world&#39;"
    );
  });

  it("passes through safe strings", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

describe("svgBarChart", () => {
  it("renders horizontal bars with labels", () => {
    const svg = svgBarChart({
      items: [
        { label: "home", value: 45 },
        { label: "osp", value: 18 },
        { label: "pipeline", value: 12 },
      ],
      width: 600,
      barHeight: 20,
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("home");
    expect(svg).toContain("osp");
    expect(svg).toContain("pipeline");
    expect(svg).toContain("<rect");
    // Values should appear
    expect(svg).toContain("45");
    expect(svg).toContain("18");
    expect(svg).toContain("12");
  });

  it("handles empty items", () => {
    const svg = svgBarChart({ items: [], width: 600, barHeight: 20 });
    expect(svg).toContain("<svg");
    expect(svg).toContain("No data");
  });

  it("handles single item", () => {
    const svg = svgBarChart({
      items: [{ label: "bash", value: 100 }],
      width: 600,
      barHeight: 20,
    });
    expect(svg).toContain("bash");
    expect(svg).toContain("100");
  });
});

describe("svgLineChart", () => {
  it("renders a line with data points", () => {
    const svg = svgLineChart({
      points: [
        { label: "Feb 9", value: 45 },
        { label: "Feb 10", value: 71 },
        { label: "Feb 11", value: 142 },
      ],
      width: 600,
      height: 200,
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("<polyline");
    expect(svg).toContain("<circle");
    expect(svg).toContain("Feb 9");
    expect(svg).toContain("Feb 10");
    expect(svg).toContain("Feb 11");
  });

  it("renders area fill when requested", () => {
    const svg = svgLineChart({
      points: [
        { label: "A", value: 10 },
        { label: "B", value: 20 },
      ],
      width: 600,
      height: 200,
      fill: true,
    });
    expect(svg).toContain("<polygon");
  });

  it("handles single point", () => {
    const svg = svgLineChart({
      points: [{ label: "Today", value: 42 }],
      width: 600,
      height: 200,
    });
    expect(svg).toContain("<circle");
    expect(svg).toContain("42");
  });

  it("handles empty points", () => {
    const svg = svgLineChart({ points: [], width: 600, height: 200 });
    expect(svg).toContain("No data");
  });
});

describe("svgDonutChart", () => {
  it("renders segments with colors", () => {
    const svg = svgDonutChart({
      segments: [
        { label: "claude-sonnet", value: 114, color: "#6366f1" },
        { label: "claude-opus", value: 146, color: "#22c55e" },
      ],
      size: 200,
      centerLabel: "258M",
      centerSub: "tokens",
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("<circle");
    expect(svg).toContain("258M");
    expect(svg).toContain("tokens");
    expect(svg).toContain("stroke=\"#6366f1\"");
    expect(svg).toContain("stroke=\"#22c55e\"");
  });

  it("handles single segment (full circle)", () => {
    const svg = svgDonutChart({
      segments: [{ label: "only", value: 100, color: "#f00" }],
      size: 200,
    });
    expect(svg).toContain("<circle");
  });

  it("handles empty segments", () => {
    const svg = svgDonutChart({ segments: [], size: 200 });
    expect(svg).toContain("No data");
  });
});

describe("svgHeatmap", () => {
  it("renders a grid of rects", () => {
    const days = [
      { date: new Date("2026-02-09"), value: 15 },
      { date: new Date("2026-02-10"), value: 35 },
      { date: new Date("2026-02-11"), value: 32 },
    ];
    const svg = svgHeatmap({ days, cellSize: 13, gap: 2 });
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
    // Should have heat level classes or fill colors
    expect(svg).toMatch(/fill=/);
  });

  it("handles empty days", () => {
    const svg = svgHeatmap({ days: [], cellSize: 13, gap: 2 });
    expect(svg).toContain("<svg");
  });

  it("includes legend", () => {
    const days = [{ date: new Date("2026-02-10"), value: 5 }];
    const svg = svgHeatmap({ days, cellSize: 13, gap: 2 });
    expect(svg).toContain("Less");
    expect(svg).toContain("More");
  });
});
