/* ===========================================================================
 * app.js — wires the page up to the quantum engine (QE) defined in
 * quantum-engine.js. Handles the gate palette, the live SVG ZX-diagram, the
 * probability bars and the "Measure!" button.
 * ======================================================================== */
(function () {
  "use strict";

  // Update this once the GitHub repo exists (also used by the README links).
  const REPO_URL = "https://github.com/ValentinaCarmignani/quantum-logic-visualiser";

  const SVGNS = "http://www.w3.org/2000/svg";
  const VIEW_W = 760, VIEW_H = 320;

  /* ---- application state ---- */
  const state = {
    circuit: [],
    nQubits: 2,
    selectedGate: "H",
    simplified: false,
  };

  /* ---- handy DOM lookups ---- */
  const $ = (id) => document.getElementById(id);
  const svg = $("zx-svg");

  /* ===================================================================== */
  /*  Setup                                                                */
  /* ===================================================================== */
  function init() {
    buildPalette();
    $("q-plus").onclick = () => changeQubits(1);
    $("q-minus").onclick = () => changeQubits(-1);
    $("add-gate").onclick = addGate;
    $("undo").onclick = () => { state.circuit.pop(); render(); };
    $("clear").onclick = () => { state.circuit = []; render(); };
    $("simplify").onclick = (e) => {
      state.simplified = !state.simplified;
      e.currentTarget.classList.toggle("on", state.simplified);
      render();
    };
    $("measure").onclick = measure;
    $("qubit-input").addEventListener("keydown", (e) => { if (e.key === "Enter") addGate(); });
    $("angle-input").addEventListener("keydown", (e) => { if (e.key === "Enter") addGate(); });

    document.querySelectorAll(".ex-btn").forEach((b) => {
      b.onclick = () => loadExample(b.dataset.example);
    });
    document.querySelectorAll("[data-github]").forEach((a) => { a.href = REPO_URL; a.target = "_blank"; });

    selectGate("H");
    render();
  }

  function buildPalette() {
    document.querySelectorAll(".gate-grid").forEach((grid) => {
      grid.dataset.gates.split(",").forEach((name) => {
        const b = document.createElement("button");
        b.className = "gate-btn";
        b.textContent = name;
        b.dataset.gate = name;
        b.onclick = () => selectGate(name);
        b.onmouseenter = (e) => showTip(e, QE.GATE_HELP[name] || name);
        b.onmouseleave = hideTip;
        grid.appendChild(b);
      });
    });
  }

  /* ===================================================================== */
  /*  Controls                                                             */
  /* ===================================================================== */
  function selectGate(name) {
    state.selectedGate = name;
    $("sel-gate").textContent = name;
    $("sel-help").textContent = QE.GATE_HELP[name] || "";
    $("angle-row").hidden = !QE.PARAMETRIC.has(name);
    document.querySelectorAll(".gate-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.gate === name));
    const qi = $("qubit-input");
    if (QE.GATE_ARITY[name] === 2 && !qi.value.includes(",")) qi.value = "0,1";
    if (QE.GATE_ARITY[name] === 1 && qi.value.includes(",")) qi.value = "0";
  }

  function changeQubits(delta) {
    state.nQubits = Math.max(1, Math.min(8, state.nQubits + delta));
    $("q-count").textContent = state.nQubits;
    // drop gates that now point at a missing qubit
    state.circuit = state.circuit.filter(fitsCircuit);
    render();
  }

  function fitsCircuit(gate) {
    try {
      const g = QE.normaliseGate(gate);
      const qs = g.slice(1, 1 + QE.GATE_ARITY[g[0]]);
      return qs.every((q) => Number(q) < state.nQubits);
    } catch (_) { return false; }
  }

  function parseAngle(text) {
    let t = String(text).trim().toLowerCase().replace(/\s+/g, "");
    if (!t) throw new Error("Please type an angle, e.g. pi/2");
    t = t.replace(/pi/g, "(" + Math.PI + ")");
    if (!/^[-0-9.+*/()]+$/.test(t)) throw new Error("'" + text + "' is not a valid angle.");
    let val;
    try { val = Function('"use strict";return (' + t + ")")(); }
    catch (_) { throw new Error("'" + text + "' is not a valid angle."); }
    if (!isFinite(val)) throw new Error("'" + text + "' is not a valid angle.");
    return val;
  }

  function addGate() {
    const name = state.selectedGate;
    const raw = $("qubit-input").value.trim();
    try {
      let qubits;
      if (QE.GATE_ARITY[name] === 2) {
        const parts = raw.replace(/\s+/g, "").split(",").filter((p) => p !== "");
        if (parts.length !== 2) throw new Error(name + " needs two qubits, e.g. 0,1");
        qubits = [Number(parts[0]), Number(parts[1])];
      } else {
        if (raw === "") throw new Error("Please type a qubit number.");
        qubits = [Number(raw)];
      }
      const gate = [name, ...qubits];
      if (QE.PARAMETRIC.has(name)) gate.push(parseAngle($("angle-input").value));
      const norm = QE.normaliseGate(gate);
      if (!fitsCircuit(norm)) {
        throw new Error("This circuit has " + state.nQubits + " qubit(s) (0…" +
          (state.nQubits - 1) + "). Add more qubits first.");
      }
      state.circuit.push(norm);
      flash($("add-gate"));
      render(true);
    } catch (e) {
      toast(e.message);
    }
  }

  function loadExample(kind) {
    const ex = {
      bell: [2, [["H", 0], ["CNOT", 0, 1]]],
      ghz: [3, [["H", 0], ["CNOT", 0, 1], ["CNOT", 1, 2]]],
      super: [1, [["H", 0]]],
    }[kind];
    if (!ex) return;
    state.nQubits = ex[0];
    $("q-count").textContent = state.nQubits;
    state.circuit = ex[1].map((g) => g.slice());
    render(true);
  }

  /* ===================================================================== */
  /*  Rendering                                                            */
  /* ===================================================================== */
  function render(animate) {
    drawCircuitStrip();
    let graph = QE.buildZXGraph(state.circuit);
    if (state.simplified) graph = QE.fuseSpiders(graph);
    layout(graph);
    drawDiagram(graph, animate);
    drawProbabilities();
  }

  function drawCircuitStrip() {
    const strip = $("circuit-strip");
    strip.innerHTML = "";
    if (!state.circuit.length) {
      strip.innerHTML = '<span class="circuit-empty">Your circuit is empty — add a gate to begin.</span>';
      return;
    }
    state.circuit.forEach((gate, i) => {
      const g = QE.normaliseGate(gate);
      const chip = document.createElement("span");
      chip.className = "gate-chip";
      let label = g[0];
      if (QE.PARAMETRIC.has(g[0])) label += "(" + QE.prettyPhase(g[g.length - 1]) + ") q" + g[1];
      else if (QE.GATE_ARITY[g[0]] === 2) label += " q" + g[1] + ",q" + g[2];
      else label += " q" + g[1];
      chip.innerHTML = label + ' <span class="x">✕</span>';
      chip.title = "Click to remove";
      chip.onclick = () => { state.circuit.splice(i, 1); render(); };
      strip.appendChild(chip);
    });
  }

  function layout(graph) {
    const n = state.nQubits;
    const left = 110, right = 700, top = 60, bottom = 260;
    const rowGap = n > 1 ? Math.min(90, (bottom - top) / (n - 1)) : 0;
    const startY = VIEW_H / 2 - (rowGap * (n - 1)) / 2;
    const yOf = (q) => (n > 1 ? startY + q * rowGap : VIEW_H / 2);

    const cols = [...new Set(graph.map((s) => s.column))].sort((a, b) => a - b);
    const colX = {};
    const step = (right - left) / Math.max(1, cols.length);
    cols.forEach((c, i) => { colX[c] = left + i * step + step / 2; });

    const seen = {};
    graph.forEach((s) => {
      const base = colX[s.column] !== undefined ? colX[s.column] : (left + right) / 2;
      const key = s.column + ":" + s.qubit;
      const k = seen[key] || 0; seen[key] = k + 1;
      s.x = base + k * 22;
      s.y = yOf(s.qubit);
    });
    layout._yOf = yOf;
  }

  function el(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function drawDiagram(graph, animate) {
    svg.innerHTML = "";
    const n = state.nQubits;
    const yOf = layout._yOf || ((q) => 60 + q * 80);

    // qubit wires + labels
    for (let q = 0; q < n; q++) {
      const y = yOf(q);
      svg.appendChild(el("line", { x1: 70, y1: y, x2: 712, y2: y, stroke: "#3a3f66", "stroke-width": 2 }));
      const lbl = el("text", { x: 44, y: y + 5, fill: "#a3a9d4", "font-size": 15, "font-weight": 700, "text-anchor": "middle" });
      lbl.textContent = "q" + q;
      svg.appendChild(lbl);
      const k0 = el("text", { x: 78, y: y - 12, fill: "#a3a9d4", "font-size": 12, "font-family": "Consolas, monospace" });
      k0.textContent = "|0⟩";
      svg.appendChild(k0);
    }

    if (!graph.length) {
      const t = el("text", { x: VIEW_W / 2, y: VIEW_H / 2, fill: "#a3a9d4", "font-size": 15, "text-anchor": "middle" });
      t.textContent = "Click a gate, choose a qubit, then press  ➕ Add gate";
      svg.appendChild(t);
      return;
    }

    // edges
    graph.forEach((s, i) => {
      s.edges.forEach((j) => {
        if (j <= i || j >= graph.length) return;
        const t = graph[j];
        const isH = s.hadamardEdges.includes(j);
        const line = el("line", {
          x1: s.x, y1: s.y, x2: t.x, y2: t.y,
          stroke: isH ? "#ffd23f" : "#5a6099",
          "stroke-width": isH ? 3 : 2.5,
          class: "zx-edge",
        });
        if (isH) line.setAttribute("stroke-dasharray", "5 4");
        svg.appendChild(line);
        if (isH) {
          const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
          svg.appendChild(el("rect", { x: mx - 7, y: my - 7, width: 14, height: 14, rx: 3, fill: "#ffd23f", class: "zx-node" }));
        }
      });
    });

    // nodes
    graph.forEach((s, i) => {
      const g = el("g", { class: "zx-node" });
      if (animate) g.style.animationDelay = (i * 0.08) + "s";
      const tip = nodeTip(s);
      g.addEventListener("mouseenter", (e) => showTip(e, tip));
      g.addEventListener("mousemove", (e) => showTip(e, tip));
      g.addEventListener("mouseleave", hideTip);

      if (s.type === QE.H_BOX) {
        g.appendChild(el("rect", { x: s.x - 16, y: s.y - 16, width: 32, height: 32, rx: 5, fill: "#ffd23f", stroke: "#fff", "stroke-width": 2 }));
        const t = el("text", { x: s.x, y: s.y + 6, "text-anchor": "middle", fill: "#3a2f00", "font-size": 16, "font-weight": 700, "font-family": "Fredoka, sans-serif" });
        t.textContent = "H";
        g.appendChild(t);
      } else {
        g.appendChild(el("circle", { cx: s.x, cy: s.y, r: 16, fill: s.colour, stroke: "#fff", "stroke-width": 2 }));
        const label = QE.prettyPhase(s.phase);
        if (label !== "0") {
          const t = el("text", { x: s.x, y: s.y + 5, "text-anchor": "middle", "font-size": 12, "font-weight": 700,
            fill: s.type === QE.Z_SPIDER ? "#06210f" : "#3a0008" });
          t.textContent = label;
          g.appendChild(t);
        }
      }
      svg.appendChild(g);
    });
  }

  function nodeTip(s) {
    if (s.type === QE.H_BOX) return "Hadamard box — swaps the Z and X worlds (makes superposition).";
    const colour = s.type === QE.Z_SPIDER ? "Green Z-spider" : "Red X-spider";
    const ph = QE.prettyPhase(s.phase);
    return colour + (ph === "0" ? "" : " · phase " + ph) + " · on qubit " + s.qubit;
  }

  /* ---- probability bars ---- */
  let lastProbs = {};
  function drawProbabilities() {
    const wrap = $("prob-bars");
    wrap.innerHTML = "";
    $("measure-msg").textContent = "";
    let probs, ket;
    try {
      const sim = QE.Simulator(state.nQubits);
      sim.run(state.circuit);
      probs = sim.probabilities();
      ket = sim.ketString();
    } catch (e) {
      $("ket").textContent = e.message;
      return;
    }
    lastProbs = probs;
    $("ket").textContent = ket;

    const entries = Object.entries(probs).sort((a, b) => a[0].localeCompare(b[0]));
    entries.forEach(([bits, p]) => {
      const col = document.createElement("div");
      col.className = "prob-col";
      col.dataset.bits = bits;
      const pct = document.createElement("div");
      pct.className = "prob-pct";
      pct.textContent = Math.round(p * 100) + "%";
      const bar = document.createElement("div");
      bar.className = "prob-bar";
      bar.style.height = "3px";
      const lbl = document.createElement("div");
      lbl.className = "prob-label";
      lbl.textContent = "|" + bits + "⟩";
      col.appendChild(pct); col.appendChild(bar); col.appendChild(lbl);
      wrap.appendChild(col);
      // animate to full height next frame
      requestAnimationFrame(() => { bar.style.height = Math.max(3, p * 120) + "px"; });
    });
  }

  /* ---- measurement (collapse) ---- */
  function measure() {
    const entries = Object.entries(lastProbs);
    if (!entries.length) return;
    const r = Math.random();
    let acc = 0, chosen = entries[0][0];
    for (const [bits, p] of entries) { acc += p; if (r <= acc) { chosen = bits; break; } }

    document.querySelectorAll(".prob-col").forEach((col) => {
      const bar = col.querySelector(".prob-bar");
      const pct = col.querySelector(".prob-pct");
      if (col.dataset.bits === chosen) {
        bar.classList.add("collapsed");
        bar.style.height = "120px";
        pct.textContent = "100%";
      } else {
        bar.style.height = "3px";
        pct.textContent = "0%";
      }
    });
    const msg = $("measure-msg");
    msg.textContent = "🎯 You measured |" + chosen + "⟩  (change the circuit to reset)";
  }

  /* ===================================================================== */
  /*  Tiny UI helpers                                                      */
  /* ===================================================================== */
  const tip = $("tooltip");
  function showTip(e, text) {
    tip.textContent = text;
    tip.hidden = false;
    const pad = 14;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + 250 > window.innerWidth) x = e.clientX - 250;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function hideTip() { tip.hidden = true; }

  function toast(msg) {
    const m = $("measure-msg");
    m.textContent = "⚠ " + msg;
    m.style.color = "#ff5a5f";
    setTimeout(() => { m.style.color = ""; if (m.textContent === "⚠ " + msg) m.textContent = ""; }, 3200);
  }

  function flash(btn) {
    if (typeof btn.animate === "function") {
      btn.animate([{ transform: "scale(1)" }, { transform: "scale(0.94)" }, { transform: "scale(1)" }], { duration: 180 });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
