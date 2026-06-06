/* ===========================================================================
 * quantum-engine.js
 * ---------------------------------------------------------------------------
 * The maths behind the Quantum Logic Visualiser, ported from the Python core
 * (zx_core.py + simulator.py) so the website needs no server - everything runs
 * right inside the browser.
 *
 * Two jobs:
 *   1. Turn a circuit (list of gates) into a ZX-diagram of coloured "spiders".
 *   2. Simulate the circuit exactly and report measurement probabilities.
 *
 * Exposed on the global `QE` object at the bottom.
 * ======================================================================== */
(function () {
  "use strict";

  const PI = Math.PI;

  /* ---- spider types / colours ------------------------------------------ */
  const Z_SPIDER = "Z"; // green
  const X_SPIDER = "X"; // red
  const H_BOX = "H";    // yellow Hadamard box

  const COLOURS = {
    Z: "#3DDC84",
    X: "#FF5A5F",
    H: "#FFD23F",
  };

  /* ---- gate catalogue -------------------------------------------------- */
  const GATE_ARITY = {
    I: 1, X: 1, Y: 1, Z: 1, H: 1, S: 1, SDG: 1, T: 1, TDG: 1,
    RX: 1, RY: 1, RZ: 1,
    CNOT: 2, CX: 2, CZ: 2, SWAP: 2,
  };
  const PARAMETRIC = new Set(["RX", "RY", "RZ"]);

  const GATE_HELP = {
    H: "Hadamard - creates superposition, an equal mix of |0> and |1>.",
    X: "Pauli-X - the quantum NOT gate. Flips |0> and |1>.",
    Y: "Pauli-Y - a flip plus a phase.",
    Z: "Pauli-Z - flips the sign of the |1> part.",
    S: "Phase gate - a quarter turn (pi/2) around Z.",
    T: "T gate - an eighth turn (pi/4) around Z.",
    RX: "Rotate the qubit by your chosen angle around the X axis.",
    RY: "Rotate the qubit by your chosen angle around the Y axis.",
    RZ: "Rotate the qubit by your chosen angle around the Z axis.",
    CNOT: "Controlled-NOT - flips the target if the control is |1>. Makes entanglement!",
    CZ: "Controlled-Z - adds a phase when both qubits are |1>.",
    SWAP: "Swap - exchanges the states of two qubits.",
  };

  function CircuitError(msg) {
    const e = new Error(msg);
    e.name = "CircuitError";
    return e;
  }

  /* ---- normalise / validate a gate ------------------------------------- */
  function normaliseGate(gate) {
    if (!Array.isArray(gate) || gate.length === 0) {
      throw CircuitError("A gate must look like ['H', 0] or ['CNOT', 0, 1].");
    }
    const name = String(gate[0]).trim().toUpperCase();
    if (!(name in GATE_ARITY)) {
      throw CircuitError(`'${gate[0]}' is not a gate I know.`);
    }
    const arity = GATE_ARITY[name];
    let args = gate.slice(1);
    let angle = null;
    if (PARAMETRIC.has(name)) {
      if (args.length < 1) throw CircuitError(`${name} needs an angle.`);
      angle = Number(args[args.length - 1]);
      args = args.slice(0, -1);
    }
    if (args.length !== arity) {
      throw CircuitError(`${name} acts on ${arity} qubit(s) but got ${args.length}.`);
    }
    const qubits = args.map((q) => {
      const qi = Number(q);
      if (!Number.isInteger(qi) || qi < 0) {
        throw CircuitError(`Qubit index '${q}' must be a whole number >= 0.`);
      }
      return qi;
    });
    if (arity === 2 && qubits[0] === qubits[1]) {
      throw CircuitError(`${name} needs two different qubits.`);
    }
    return angle === null ? [name, ...qubits] : [name, ...qubits, angle];
  }

  /* ---- a spider -------------------------------------------------------- */
  function Spider(type, qubit, phase, column) {
    return {
      type: type,
      qubit: qubit,
      phase: phase || 0,
      column: column || 0,
      edges: [],
      hadamardEdges: [],
      x: 0,
      y: 0,
      colour: COLOURS[type],
    };
  }

  /* ---- gate -> spiders ------------------------------------------------- */
  function gateToSpiders(gate, column) {
    const g = normaliseGate(gate);
    const name = g[0];

    if (name === "I") return [Spider(Z_SPIDER, g[1], 0, column)];
    if (name === "Z") return [Spider(Z_SPIDER, g[1], PI, column)];
    if (name === "S") return [Spider(Z_SPIDER, g[1], PI / 2, column)];
    if (name === "SDG") return [Spider(Z_SPIDER, g[1], -PI / 2, column)];
    if (name === "T") return [Spider(Z_SPIDER, g[1], PI / 4, column)];
    if (name === "TDG") return [Spider(Z_SPIDER, g[1], -PI / 4, column)];
    if (name === "RZ") return [Spider(Z_SPIDER, g[1], g[2], column)];
    if (name === "X") return [Spider(X_SPIDER, g[1], PI, column)];
    if (name === "RX") return [Spider(X_SPIDER, g[1], g[2], column)];
    if (name === "Y") {
      return [Spider(X_SPIDER, g[1], PI, column), Spider(Z_SPIDER, g[1], PI, column)];
    }
    if (name === "RY") {
      return [
        Spider(Z_SPIDER, g[1], -PI / 2, column),
        Spider(X_SPIDER, g[1], g[2], column),
        Spider(Z_SPIDER, g[1], PI / 2, column),
      ];
    }
    if (name === "H") return [Spider(H_BOX, g[1], 0, column)];

    if (name === "CNOT" || name === "CX") {
      const control = Spider(Z_SPIDER, g[1], 0, column);
      const target = Spider(X_SPIDER, g[2], 0, column);
      control.edges.push(1);
      target.edges.push(0);
      return [control, target];
    }
    if (name === "CZ") {
      const a = Spider(Z_SPIDER, g[1], 0, column);
      const b = Spider(Z_SPIDER, g[2], 0, column);
      a.edges.push(1); b.edges.push(0);
      a.hadamardEdges.push(1); b.hadamardEdges.push(0);
      return [a, b];
    }
    if (name === "SWAP") {
      const a = Spider(Z_SPIDER, g[1], 0, column);
      const b = Spider(Z_SPIDER, g[2], 0, column);
      a.edges.push(1); b.edges.push(0);
      a.isSwap = true; b.isSwap = true;
      return [a, b];
    }
    throw CircuitError(`No ZX rule for ${name}.`);
  }

  /* ---- circuit -> full graph ------------------------------------------- */
  function buildZXGraph(circuit) {
    const graph = [];
    const lastOnQubit = {};
    circuit.forEach((gate, column) => {
      const spiders = gateToSpiders(gate, column);
      const base = graph.length;
      spiders.forEach((sp) => {
        sp.edges = sp.edges.map((e) => base + e);
        sp.hadamardEdges = sp.hadamardEdges.map((e) => base + e);
      });
      spiders.forEach((sp, offset) => {
        const idx = base + offset;
        const q = sp.qubit;
        if (q in lastOnQubit) {
          const prev = lastOnQubit[q];
          graph[prev].edges.push(idx);
          sp.edges.push(prev);
        }
        lastOnQubit[q] = idx;
        graph.push(sp);
      });
    });
    return graph;
  }

  /* ---- spider fusion (the first ZX simplification rule) ---------------- */
  function fuseSpiders(graph) {
    const spiders = graph.map((s) => ({
      type: s.type, qubit: s.qubit, phase: s.phase, column: s.column,
      edges: s.edges.slice(), hadamardEdges: s.hadamardEdges.slice(),
      colour: s.colour, isSwap: s.isSwap, x: 0, y: 0,
    }));

    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < spiders.length && !changed; i++) {
        const a = spiders[i];
        if (!a) continue;
        for (const j of a.edges.slice()) {
          const b = spiders[j];
          if (!b) continue;
          const sameColour =
            a.type === b.type &&
            (a.type === Z_SPIDER || a.type === X_SPIDER) &&
            a.qubit === b.qubit &&
            !a.hadamardEdges.includes(j);
          if (sameColour) {
            a.phase = wrapPhase(a.phase + b.phase);
            for (const k of b.edges) {
              if (k !== i && spiders[k]) {
                if (!a.edges.includes(k)) a.edges.push(k);
                spiders[k].edges = spiders[k].edges.map((e) => (e === j ? i : e));
              }
            }
            a.edges = a.edges.filter((e) => e !== j && e !== i);
            spiders[j] = null;
            changed = true;
            break;
          }
        }
      }
    }
    const keep = [];
    spiders.forEach((s, k) => { if (s) keep.push(k); });
    const remap = {};
    keep.forEach((old, nw) => { remap[old] = nw; });
    return keep.map((old) => {
      const s = spiders[old];
      s.edges = [...new Set(s.edges.filter((e) => e in remap).map((e) => remap[e]))].sort((p, q) => p - q);
      s.hadamardEdges = [...new Set(s.hadamardEdges.filter((e) => e in remap).map((e) => remap[e]))].sort((p, q) => p - q);
      return s;
    });
  }

  /* ---- phase helpers --------------------------------------------------- */
  function wrapPhase(phase) {
    const twoPi = 2 * PI;
    phase = ((phase % twoPi) + twoPi) % twoPi;
    if (phase > PI) phase -= twoPi;
    if (Math.abs(phase) < 1e-9) phase = 0;
    return phase;
  }

  function prettyPhase(phase) {
    phase = wrapPhase(phase);
    if (phase === 0) return "0";
    const denoms = [1, 2, 3, 4, 6, 8];
    for (const d of denoms) {
      for (let n = -2 * d; n <= 2 * d; n++) {
        if (n === 0) continue;
        if (Math.abs(phase - (n * PI) / d) < 1e-6) {
          const sign = n < 0 ? "-" : "";
          const an = Math.abs(n);
          if (d === 1) return an === 1 ? sign + "π" : sign + an + "π";
          if (an === 1) return sign + "π/" + d;
          return sign + an + "π/" + d;
        }
      }
    }
    return phase.toFixed(2);
  }

  /* ===================================================================== *
   * Exact statevector simulator
   * Convention: qubit 0 is the most-significant bit (leftmost in a ket),
   * matching how the diagram is drawn (q0 on top).
   * ===================================================================== */
  function Simulator(nQubits) {
    if (nQubits < 1 || nQubits > 12) {
      throw new Error("This simulator supports 1 to 12 qubits.");
    }
    const size = 1 << nQubits;
    let re = new Float64Array(size);
    let im = new Float64Array(size);

    function reset() {
      re = new Float64Array(size);
      im = new Float64Array(size);
      re[0] = 1;
    }
    reset();

    // bit position of qubit q (q0 = most significant)
    const bit = (q) => nQubits - 1 - q;

    function applySingle(M, q) {
      // M = [[a,b],[c,d]] each entry [re,im]
      const mask = 1 << bit(q);
      for (let i = 0; i < size; i++) {
        if (i & mask) continue;
        const j = i | mask;
        const a0r = re[i], a0i = im[i], a1r = re[j], a1i = im[j];
        // new0 = M00*a0 + M01*a1 ; new1 = M10*a0 + M11*a1 (complex)
        re[i] = M[0][0][0] * a0r - M[0][0][1] * a0i + M[0][1][0] * a1r - M[0][1][1] * a1i;
        im[i] = M[0][0][0] * a0i + M[0][0][1] * a0r + M[0][1][0] * a1i + M[0][1][1] * a1r;
        re[j] = M[1][0][0] * a0r - M[1][0][1] * a0i + M[1][1][0] * a1r - M[1][1][1] * a1i;
        im[j] = M[1][0][0] * a0i + M[1][0][1] * a0r + M[1][1][0] * a1i + M[1][1][1] * a1r;
      }
    }

    function applyCNOT(c, t) {
      const cm = 1 << bit(c), tm = 1 << bit(t);
      for (let i = 0; i < size; i++) {
        if ((i & cm) && !(i & tm)) {
          const j = i | tm;
          const tr = re[i], ti = im[i];
          re[i] = re[j]; im[i] = im[j];
          re[j] = tr; im[j] = ti;
        }
      }
    }

    function applyCZ(a, b) {
      const am = 1 << bit(a), bm = 1 << bit(b);
      for (let i = 0; i < size; i++) {
        if ((i & am) && (i & bm)) { re[i] = -re[i]; im[i] = -im[i]; }
      }
    }

    function applySWAP(a, b) {
      const am = 1 << bit(a), bm = 1 << bit(b);
      for (let i = 0; i < size; i++) {
        const ba = (i & am) ? 1 : 0, bb = (i & bm) ? 1 : 0;
        if (ba === 1 && bb === 0) {
          const j = (i & ~am) | bm;
          const tr = re[i], ti = im[i];
          re[i] = re[j]; im[i] = im[j];
          re[j] = tr; im[j] = ti;
        }
      }
    }

    function matrix(name, angle) {
      const c = Math.cos((angle || 0) / 2);
      const s = Math.sin((angle || 0) / 2);
      const E = (th) => [Math.cos(th), Math.sin(th)]; // e^{i th}
      switch (name) {
        case "I": return [[[1, 0], [0, 0]], [[0, 0], [1, 0]]];
        case "X": return [[[0, 0], [1, 0]], [[1, 0], [0, 0]]];
        case "Y": return [[[0, 0], [0, -1]], [[0, 1], [0, 0]]];
        case "Z": return [[[1, 0], [0, 0]], [[0, 0], [-1, 0]]];
        case "H": { const r = 1 / Math.SQRT2; return [[[r, 0], [r, 0]], [[r, 0], [-r, 0]]]; }
        case "S": return [[[1, 0], [0, 0]], [[0, 0], [0, 1]]];
        case "SDG": return [[[1, 0], [0, 0]], [[0, 0], [0, -1]]];
        case "T": return [[[1, 0], [0, 0]], [[0, 0], E(PI / 4)]];
        case "TDG": return [[[1, 0], [0, 0]], [[0, 0], E(-PI / 4)]];
        case "RX": return [[[c, 0], [0, -s]], [[0, -s], [c, 0]]];
        case "RY": return [[[c, 0], [-s, 0]], [[s, 0], [c, 0]]];
        case "RZ": return [[E(-angle / 2), [0, 0]], [[0, 0], E(angle / 2)]];
        default: throw new Error(name + " is not single-qubit");
      }
    }

    function applyGate(gate) {
      const g = normaliseGate(gate);
      const name = g[0];
      const used = g.slice(1, 1 + GATE_ARITY[name]).map(Number);
      const maxQ = Math.max(...used);
      if (maxQ >= nQubits) {
        throw new Error(`Gate ${name} uses qubit ${maxQ}, but there are only ${nQubits} qubit(s).`);
      }
      if (name === "CNOT" || name === "CX") applyCNOT(g[1], g[2]);
      else if (name === "CZ") applyCZ(g[1], g[2]);
      else if (name === "SWAP") applySWAP(g[1], g[2]);
      else applySingle(matrix(name, PARAMETRIC.has(name) ? g[2] : 0), g[1]);
    }

    function run(circuit) {
      reset();
      circuit.forEach(applyGate);
    }

    function probabilities(threshold) {
      threshold = threshold || 1e-9;
      const out = {};
      for (let i = 0; i < size; i++) {
        const p = re[i] * re[i] + im[i] * im[i];
        if (p > threshold) out[i.toString(2).padStart(nQubits, "0")] = p;
      }
      return out;
    }

    function ketString(threshold) {
      threshold = threshold || 1e-3;
      const terms = [];
      for (let i = 0; i < size; i++) {
        const mag = Math.hypot(re[i], im[i]);
        if (mag * mag <= threshold) continue;
        const phase = Math.atan2(im[i], re[i]);
        let coeff;
        if (Math.abs(phase) < 1e-6) coeff = mag.toFixed(2);
        else if (Math.abs(Math.abs(phase) - PI) < 1e-6) coeff = "-" + mag.toFixed(2);
        else coeff = mag.toFixed(2) + "e^(i" + phase.toFixed(2) + ")";
        terms.push(coeff + "|" + i.toString(2).padStart(nQubits, "0") + "⟩");
        if (terms.length >= 8) { terms.push("..."); break; }
      }
      return terms.length ? terms.join("  +  ") : "0";
    }

    return { reset, run, applyGate, probabilities, ketString,
             get nQubits() { return nQubits; } };
  }

  /* ---- describe a circuit in plain words ------------------------------- */
  function describeCircuit(circuit) {
    if (!circuit.length) return "Empty - add some gates!";
    return circuit.map((gate) => {
      const g = normaliseGate(gate);
      const name = g[0];
      if (PARAMETRIC.has(name)) return `${name}(${prettyPhase(g[g.length - 1])}) q${g[1]}`;
      if (GATE_ARITY[name] === 2) return `${name} q${g[1]},q${g[2]}`;
      return `${name} q${g[1]}`;
    }).join("  →  ");
  }

  /* ---- export ---------------------------------------------------------- */
  const QE = {
    Z_SPIDER, X_SPIDER, H_BOX, COLOURS, GATE_ARITY, PARAMETRIC, GATE_HELP,
    CircuitError, normaliseGate, gateToSpiders, buildZXGraph, fuseSpiders,
    wrapPhase, prettyPhase, describeCircuit, Simulator, PI,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = QE;
  if (typeof window !== "undefined") window.QE = QE;
})();
