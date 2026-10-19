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
    // puzzle restrictions (set by quests.js through window.Playground)
    locked: 0,          // the first `locked` gates belong to the puzzle and can't be removed
    allowed: null,      // Set of gate names the student may use, or null for all
    fixedQubits: false, // true = the qubit count can't be changed
    target: null,       // goal probabilities, drawn as dashed outlines on the bars
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
    $("undo").onclick = () => {
      if (state.circuit.length > state.locked) state.circuit.pop();
      render();
    };
    $("clear").onclick = () => { state.circuit = state.circuit.slice(0, state.locked); hideGuide(); render(); };
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
    document.querySelectorAll(".try-btn").forEach((b) => {
      b.onclick = () => tryLesson(b.dataset.try);
    });
    $("guide-close").onclick = hideGuide;
    document.querySelectorAll("[data-github]").forEach((a) => { a.href = REPO_URL; a.target = "_blank"; });

    // redraw the diagram when colour-blind mode is switched on or off
    document.addEventListener("a11ychange", (e) => { if (e.detail.name === "cb") render(); });

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
    if (state.allowed && !state.allowed.has(name)) return;
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
    if (state.fixedQubits) return;
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
    leavePuzzle();
    const ex = {
      bell: [2, [["H", 0], ["CNOT", 0, 1]]],
      ghz: [3, [["H", 0], ["CNOT", 0, 1], ["CNOT", 1, 2]]],
      super: [1, [["H", 0]]],
    }[kind];
    if (!ex) return;
    hideGuide();
    state.nQubits = ex[0];
    $("q-count").textContent = state.nQubits;
    state.circuit = ex[1].map((g) => g.slice());
    render(true);
  }

  /* ===================================================================== */
  /*  "Try it!" lessons — one per concept card in the Learn section        */
  /* ===================================================================== */
  // Each lesson loads a small circuit into the playground and shows a short
  // guide message telling the student what to look at and what to try next.
  const LESSONS = {
    flip: {
      qubits: 1, circuit: [["X", 0]],
      tip: "The <b>X</b> gate flipped the coin: |0⟩ became |1⟩, 100% of the time. " +
           "That's just a normal bit. Now add an <b>H</b> gate on qubit 0 and watch what changes!",
    },
    super: {
      qubits: 1, circuit: [["H", 0]],
      tip: "One <b>H</b> gate and the bars split <b>50/50</b>: the coin is spinning. " +
           "Press <b>🎲 Measure!</b> a few times. Sometimes you get 0, sometimes 1.",
    },
    bell: {
      qubits: 2, circuit: [["H", 0], ["CNOT", 0, 1]],
      tip: "<b>H</b> then <b>CNOT</b> links the two qubits. Only |00⟩ and |11⟩ are possible! " +
           "Press <b>🎲 Measure!</b> a few times: the two qubits <b>always agree</b>.",
    },
    zx: {
      qubits: 2, circuit: [["H", 0], ["CNOT", 0, 1]],
      tip: "Every gate became a picture: the <b>yellow box</b> is H, and CNOT is a " +
           "<b>green dot</b> wired to a <b>red dot</b>. Hover over any dot to see what it is.",
    },
    phase: {
      qubits: 1, circuit: [["H", 0], ["S", 0], ["T", 0]], simplify: true,
      tip: "<b>✨ Simplify</b> merged <b>S</b> (π/2) and <b>T</b> (π/4) into one dot: " +
           "π/2 + π/4 = <b>3π/4</b>. <b>The merging rule:</b> two dots join together when they are " +
           "the <b>same colour</b>, on the <b>same qubit line</b>, with <b>nothing in between</b> " +
           "(no yellow H box), and their angles <b>add up</b>. Notice the bars didn't move. A phase is " +
           "invisible until another gate turns it into something you can measure.",
    },
    measure: {
      qubits: 2, circuit: [["H", 0], ["H", 1]],
      tip: "Two spinning qubits give <b>4 possible answers</b>, 25% each. Press " +
           "<b>🎲 Measure!</b> and the superposition collapses to just one of them.",
    },
  };

  function tryLesson(name) {
    const lesson = LESSONS[name];
    if (!lesson) return;
    leavePuzzle();
    state.nQubits = lesson.qubits;
    $("q-count").textContent = state.nQubits;
    state.circuit = lesson.circuit.map((g) => g.slice());
    state.simplified = !!lesson.simplify;
    $("simplify").classList.toggle("on", state.simplified);
    render(true);
    showGuide(lesson.tip);

    const reduceMotion = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Scroll to the diagram panel (on phones the controls stack above it).
    const visual = document.querySelector(".panel.visual");
    visual.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    visual.classList.remove("spotlight");
    void visual.offsetWidth; // restart the highlight animation
    visual.classList.add("spotlight");
  }

  function showGuide(html) {
    $("guide-text").innerHTML = html;
    $("guide").hidden = false;
    if (window.A11Y) A11Y.announce(html);
  }
  function hideGuide() { $("guide").hidden = true; }

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
    document.dispatchEvent(new CustomEvent("playground:change", {
      detail: { probs: lastProbs, circuit: state.circuit.slice(), added: state.circuit.length - state.locked },
    }));
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
      if (i < state.locked) {
        // part of the puzzle: shown with a lock and can't be removed
        chip.classList.add("locked");
        chip.innerHTML = '<span aria-hidden="true">🔒</span> ' + label;
        chip.title = "This gate is part of the puzzle";
      } else {
        chip.innerHTML = label + ' <span class="x">✕</span>';
        chip.title = "Click to remove";
        chip.onclick = () => { state.circuit.splice(i, 1); render(); };
      }
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
        const cb = window.A11Y && A11Y.colourBlind();
        const isX = s.type === QE.X_SPIDER;
        // colour-blind mode: X spiders get a dashed ring so shape tells them apart too
        g.appendChild(el("circle", { cx: s.x, cy: s.y, r: 16, fill: s.colour, stroke: "#fff", "stroke-width": cb ? 3 : 2,
          "stroke-dasharray": cb && isX ? "5 3" : "none" }));
        if (cb) {
          // ...and a small Z or X letter badge on its top-right corner
          g.appendChild(el("circle", { cx: s.x + 15, cy: s.y - 15, r: 8, fill: "#0b0e23", stroke: "#fff", "stroke-width": 1.5 }));
          const letter = el("text", { x: s.x + 15, y: s.y - 11, "text-anchor": "middle", fill: "#fff",
            "font-size": 11, "font-weight": 800, class: "cb-letter" });
          letter.textContent = isX ? "X" : "Z";
          g.appendChild(letter);
        }
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

    let entries = Object.entries(probs);
    const target = state.target;
    if (target) {
      // show every possible outcome so empty goal columns are visible too
      const all = {};
      for (let k = 0; k < (1 << state.nQubits); k++) all[k.toString(2).padStart(state.nQubits, "0")] = 0;
      Object.assign(all, probs);
      entries = Object.entries(all);
    }
    wrap.classList.toggle("with-goal", !!target);
    entries.sort((a, b) => a[0].localeCompare(b[0]));
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
      if (target) {
        const goal = target[bits] || 0;
        const track = document.createElement("div");
        track.className = "prob-track";
        const outline = document.createElement("div");
        outline.className = "prob-goal";
        outline.style.height = Math.max(3, goal * 120) + "px";
        outline.title = "Goal: " + Math.round(goal * 100) + "%";
        track.appendChild(outline);
        track.appendChild(bar);
        if (Math.abs(goal - p) < 1e-6) col.classList.add("on-target");
        col.appendChild(pct); col.appendChild(track); col.appendChild(lbl);
      } else {
        col.appendChild(pct); col.appendChild(bar); col.appendChild(lbl);
      }
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

  /* ===================================================================== */
  /*  Puzzle hooks — used by quests.js                                     */
  /* ===================================================================== */
  function updatePalette() {
    document.querySelectorAll(".gate-btn").forEach((b) => {
      const ok = !state.allowed || state.allowed.has(b.dataset.gate);
      b.disabled = !ok;
      b.classList.toggle("unavailable", !ok);
    });
    $("q-plus").disabled = $("q-minus").disabled = state.fixedQubits;
    document.querySelector(".examples").hidden = !!state.allowed;
  }

  function setPuzzle(p) {
    hideGuide();
    state.nQubits = p.qubits;
    $("q-count").textContent = state.nQubits;
    state.circuit = p.start.map((g) => g.slice());
    state.locked = p.start.length;
    state.allowed = new Set(p.allowed);
    state.fixedQubits = true;
    state.target = p.target;
    state.simplified = false;
    $("simplify").classList.remove("on");
    updatePalette();
    selectGate(p.allowed[0]);
    $("qubit-input").value = QE.GATE_ARITY[p.allowed[0]] === 2 ? "0,1" : "0";
    render(true);
  }

  function clearPuzzle() {
    state.locked = 0;
    state.allowed = null;
    state.fixedQubits = false;
    state.target = null;
    updatePalette();
  }

  // Free-play buttons ("Try it!", examples) quietly leave quest mode first.
  function leavePuzzle() {
    if (!state.allowed) return;
    clearPuzzle();
    document.dispatchEvent(new CustomEvent("playground:freeplay"));
  }

  window.Playground = {
    setPuzzle: setPuzzle,
    clearPuzzle: () => { clearPuzzle(); render(); },
    // replace everything after the locked gates (used by "Show answer")
    setMoves(moves) {
      state.circuit = state.circuit.slice(0, state.locked).concat(moves.map((g) => g.slice()));
      render(true);
    },
    snapshot: () => ({ circuit: state.circuit.map((g) => g.slice()), nQubits: state.nQubits }),
    restore(snap) {
      state.nQubits = snap.nQubits;
      $("q-count").textContent = state.nQubits;
      state.circuit = snap.circuit.map((g) => g.slice());
      render();
    },
  };

  document.addEventListener("DOMContentLoaded", init);
})();
