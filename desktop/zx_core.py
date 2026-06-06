"""
zx_core.py
==========

The "brain" of the Quantum Logic Visualiser.

This file knows nothing about windows, buttons or colours on screen. Its only
job is to turn a *quantum circuit* (a list of gates) into a *ZX-diagram*
(a graph of coloured "spiders"). Keeping this logic separate from the drawing
code means we can test it on its own and reuse it for both the desktop app and
the website.

----------------------------------------------------------------------------
A 30-second crash course in ZX-calculus
----------------------------------------------------------------------------
ZX-calculus (invented by Bob Coecke and Ross Duncan) is a way of drawing
quantum programs as graphs instead of writing them as matrices. There are
only a few kinds of node:

  * Z-spider  -> drawn GREEN.  A rotation around the Z axis of the qubit.
  * X-spider  -> drawn RED.    A rotation around the X axis of the qubit.
  * Hadamard  -> drawn YELLOW. The "H box" that swaps the Z and X worlds.

Every spider can carry a *phase* (an angle). Wires connect the spiders and
show how information flows between qubits. Remarkably, this tiny set of pieces
is enough to express *any* quantum computation.

Famous gates translate like this:

  Gate        ZX-diagram
  ----        ----------
  Z           one GREEN spider, phase = pi
  X           one RED   spider, phase = pi
  S           one GREEN spider, phase = pi/2
  T           one GREEN spider, phase = pi/4
  RZ(theta)   one GREEN spider, phase = theta
  RX(theta)   one RED   spider, phase = theta
  H           one YELLOW Hadamard box
  CNOT        a GREEN spider (control) joined to a RED spider (target)
  CZ          two GREEN spiders joined by a Hadamard (yellow) edge
  SWAP        the two wires cross over

This file builds exactly those diagrams.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

# ---------------------------------------------------------------------------
# Spider colours / types
# ---------------------------------------------------------------------------
Z_SPIDER = "Z"   # green
X_SPIDER = "X"   # red
H_BOX = "H"      # yellow Hadamard box

COLOURS = {
    Z_SPIDER: "#3DDC84",   # friendly green
    X_SPIDER: "#FF5A5F",   # friendly red
    H_BOX: "#FFD23F",      # bright yellow
}


# ---------------------------------------------------------------------------
# The Spider: a single node in the ZX-diagram
# ---------------------------------------------------------------------------
@dataclass
class Spider:
    """One node in the ZX-diagram.

    Attributes
    ----------
    type    : "Z", "X" or "H" (green, red or yellow).
    qubit   : which horizontal wire (qubit) this spider sits on.
    phase   : the rotation angle in radians (0 for plain spiders / H boxes).
    column  : left-to-right position = how far through the circuit we are.
    edges   : indices of other spiders this one is wired to.
    hadamard_edges : the subset of `edges` that are Hadamard (yellow) wires.
    """

    type: str
    qubit: int
    phase: float = 0.0
    column: int = 0
    edges: List[int] = field(default_factory=list)
    hadamard_edges: List[int] = field(default_factory=list)
    # screen coordinates, filled in by the drawing code later
    x: float = 0.0
    y: float = 0.0

    @property
    def colour(self) -> str:
        return COLOURS[self.type]

    def phase_label(self) -> str:
        """Human-friendly phase such as 'pi', 'pi/2' or '0.30'."""
        return pretty_phase(self.phase)

    def __str__(self) -> str:
        if self.type == H_BOX:
            return f"H-box (q{self.qubit})"
        ph = self.phase_label()
        extra = f", {ph}" if ph != "0" else ""
        return f"{self.type}-spider (q{self.qubit}{extra})"


# ---------------------------------------------------------------------------
# Gate catalogue
# ---------------------------------------------------------------------------
# A gate in a circuit is a tuple. Single-qubit gates look like ("H", 0) and
# two-qubit gates look like ("CNOT", 0, 1). Rotation gates carry an angle:
# ("RZ", 0, 1.5708).
#
# This dictionary is the single source of truth for "what gates exist" so the
# GUI and the website can both read it to build their buttons.

PI = math.pi

#: number of qubits each gate touches
GATE_ARITY = {
    "I": 1, "X": 1, "Y": 1, "Z": 1, "H": 1,
    "S": 1, "SDG": 1, "T": 1, "TDG": 1,
    "RX": 1, "RY": 1, "RZ": 1,
    "CNOT": 2, "CX": 2, "CZ": 2, "SWAP": 2,
}

#: gates that need an angle typed in by the user
PARAMETRIC_GATES = {"RX", "RY", "RZ"}

#: short human descriptions shown as tooltips / help text
GATE_HELP = {
    "I": "Identity - does nothing (a plain wire).",
    "X": "Pauli-X - the quantum NOT gate. Flips |0> and |1>.",
    "Y": "Pauli-Y - a flip plus a phase.",
    "Z": "Pauli-Z - flips the sign of |1>.",
    "H": "Hadamard - creates superposition (an equal mix of |0> and |1>).",
    "S": "Phase gate - a quarter turn (pi/2) around Z.",
    "SDG": "S-dagger - the inverse of S.",
    "T": "T gate - an eighth turn (pi/4) around Z.",
    "TDG": "T-dagger - the inverse of T.",
    "RX": "Rotate the qubit by an angle around the X axis.",
    "RY": "Rotate the qubit by an angle around the Y axis.",
    "RZ": "Rotate the qubit by an angle around the Z axis.",
    "CNOT": "Controlled-NOT - flips the target qubit if the control is |1>. Makes entanglement!",
    "CX": "Controlled-NOT (another name for CNOT).",
    "CZ": "Controlled-Z - adds a phase when both qubits are |1>.",
    "SWAP": "Swap - exchanges the states of two qubits.",
}


class CircuitError(ValueError):
    """Raised when a circuit or gate is built incorrectly.

    We use a friendly, specific message so a student can fix their mistake.
    """


def normalise_gate(gate: Tuple) -> Tuple:
    """Clean up a gate tuple and check it makes sense.

    Accepts loose, human input (lower-case names, extra spaces) and returns a
    tidy, upper-case tuple. Raises CircuitError with a clear message if the
    gate is not valid - this is what protects the app from student typos.
    """
    if not isinstance(gate, (tuple, list)) or len(gate) == 0:
        raise CircuitError("A gate must look like ('H', 0) or ('CNOT', 0, 1).")

    name = str(gate[0]).strip().upper()
    if name not in GATE_ARITY:
        raise CircuitError(
            f"'{gate[0]}' is not a gate I know. "
            f"Try one of: {', '.join(sorted(GATE_ARITY))}."
        )

    arity = GATE_ARITY[name]
    qubit_args = list(gate[1:])

    # Rotation gates carry one extra number (the angle) at the end.
    angle = None
    if name in PARAMETRIC_GATES:
        if len(qubit_args) < 1:
            raise CircuitError(f"{name} needs an angle, e.g. ('{name}', 0, 1.5708).")
        angle = float(qubit_args[-1])
        qubit_args = qubit_args[:-1]

    if len(qubit_args) != arity:
        raise CircuitError(
            f"{name} acts on {arity} qubit(s) but got {len(qubit_args)}: {gate}."
        )

    qubits = []
    for q in qubit_args:
        try:
            qi = int(q)
        except (TypeError, ValueError):
            raise CircuitError(f"Qubit index '{q}' is not a whole number.")
        if qi < 0:
            raise CircuitError("Qubit indices start at 0 and cannot be negative.")
        qubits.append(qi)

    if arity == 2 and qubits[0] == qubits[1]:
        raise CircuitError(f"{name} needs two *different* qubits, not {qubits[0]} twice.")

    if angle is None:
        return tuple([name, *qubits])
    return tuple([name, *qubits, angle])


# ---------------------------------------------------------------------------
# Gate  ->  spiders
# ---------------------------------------------------------------------------
def gate_to_spiders(gate: Tuple, column: int) -> List[Spider]:
    """Translate ONE gate into the spiders that represent it in ZX-calculus.

    `column` is the left-to-right slot the gate occupies, used only for layout.
    Returns a list of freshly made Spider objects (with their internal edges
    already wired up). The caller stitches them into the wider graph.
    """
    g = normalise_gate(gate)
    name = g[0]

    # ---- single-qubit spiders -------------------------------------------
    if name == "I":
        # Identity is just a wire; a phase-0 green spider keeps the diagram
        # readable without changing the maths.
        return [Spider(Z_SPIDER, g[1], 0.0, column)]

    if name == "Z":
        return [Spider(Z_SPIDER, g[1], PI, column)]
    if name == "S":
        return [Spider(Z_SPIDER, g[1], PI / 2, column)]
    if name == "SDG":
        return [Spider(Z_SPIDER, g[1], -PI / 2, column)]
    if name == "T":
        return [Spider(Z_SPIDER, g[1], PI / 4, column)]
    if name == "TDG":
        return [Spider(Z_SPIDER, g[1], -PI / 4, column)]
    if name == "RZ":
        return [Spider(Z_SPIDER, g[1], g[2], column)]

    if name == "X":
        return [Spider(X_SPIDER, g[1], PI, column)]
    if name == "RX":
        return [Spider(X_SPIDER, g[1], g[2], column)]

    if name == "Y":
        # Y = i * X * Z, so in ZX it is a red(pi) and a green(pi) on the same
        # wire (the global phase i is not drawn).
        red = Spider(X_SPIDER, g[1], PI, column)
        green = Spider(Z_SPIDER, g[1], PI, column)
        return [red, green]

    if name == "RY":
        # RY(t) = S . RX(t) . S-dagger  (Euler-style). Three spiders stacked.
        s_dg = Spider(Z_SPIDER, g[1], -PI / 2, column)
        rx = Spider(X_SPIDER, g[1], g[2], column)
        s = Spider(Z_SPIDER, g[1], PI / 2, column)
        return [s_dg, rx, s]

    if name == "H":
        return [Spider(H_BOX, g[1], 0.0, column)]

    # ---- two-qubit spiders ----------------------------------------------
    if name in ("CNOT", "CX"):
        control = Spider(Z_SPIDER, g[1], 0.0, column)   # green = control
        target = Spider(X_SPIDER, g[2], 0.0, column)    # red   = target
        # local index 0 and 1 -> they are wired to each other
        control.edges.append(1)
        target.edges.append(0)
        return [control, target]

    if name == "CZ":
        a = Spider(Z_SPIDER, g[1], 0.0, column)
        b = Spider(Z_SPIDER, g[2], 0.0, column)
        a.edges.append(1)
        b.edges.append(0)
        # CZ is two green spiders joined by a *Hadamard* edge.
        a.hadamard_edges.append(1)
        b.hadamard_edges.append(0)
        return [a, b]

    if name == "SWAP":
        # A swap is drawn as two H-free crossing wires. We model it as two
        # green phase-0 spiders cross-wired; the layout code draws the cross.
        a = Spider(Z_SPIDER, g[1], 0.0, column)
        b = Spider(Z_SPIDER, g[2], 0.0, column)
        a.edges.append(1)
        b.edges.append(0)
        a.qubit, b.qubit = g[1], g[2]
        return [a, b]

    # normalise_gate already guards against unknown names, so we never get here
    raise CircuitError(f"No ZX rule defined for {name}.")


# ---------------------------------------------------------------------------
# Circuit  ->  full ZX graph
# ---------------------------------------------------------------------------
def build_zx_graph(circuit: List[Tuple]) -> List[Spider]:
    """Turn a whole circuit into one connected list of spiders.

    The returned list is the ZX-diagram: every Spider's `edges` list holds the
    *global* indices (positions in this returned list) of the spiders it is
    wired to. Spiders that sit one after another on the same qubit wire are
    automatically joined, so the diagram reads left-to-right like the circuit.
    """
    graph: List[Spider] = []
    last_on_qubit: dict[int, int] = {}   # qubit -> index of last spider on it

    for column, gate in enumerate(circuit):
        spiders = gate_to_spiders(gate, column)
        base = len(graph)

        # fix up the internal edges (currently local) to global indices
        for sp in spiders:
            sp.edges = [base + e for e in sp.edges]
            sp.hadamard_edges = [base + e for e in sp.hadamard_edges]

        # connect each new spider to the previous spider on the same wire
        for offset, sp in enumerate(spiders):
            idx = base + offset
            q = sp.qubit
            if q in last_on_qubit:
                prev = last_on_qubit[q]
                graph[prev].edges.append(idx)
                sp.edges.append(prev)
            last_on_qubit[q] = idx
            graph.append(sp)

    return graph


# ---------------------------------------------------------------------------
# Spider fusion - the first ZX simplification rule
# ---------------------------------------------------------------------------
def fuse_spiders(graph: List[Spider]) -> List[Spider]:
    """Apply the ZX "spider fusion" rule and return a simpler diagram.

    Fusion rule: two spiders of the SAME colour that are directly connected can
    merge into one, and their phases ADD together. This is one of the rules
    that makes ZX-calculus powerful - you can simplify a circuit just by
    sliding and merging dots. We apply it repeatedly until nothing changes,
    which is a gentle, visual demonstration of quantum circuit optimisation.

    Note: this is a teaching-grade simplifier (it fuses same-colour neighbours
    on the same wire). It is intentionally simple so students can follow it.
    """
    spiders = [Spider(s.type, s.qubit, s.phase, s.column,
                      list(s.edges), list(s.hadamard_edges)) for s in graph]

    changed = True
    while changed:
        changed = False
        for i, a in enumerate(spiders):
            if a is None:
                continue
            for j in list(a.edges):
                b = spiders[j]
                if b is None:
                    continue
                same_colour = (
                    a.type == b.type
                    and a.type in (Z_SPIDER, X_SPIDER)
                    and a.qubit == b.qubit
                    and j not in a.hadamard_edges   # a plain wire, not Hadamard
                )
                if same_colour:
                    # merge b into a: phases add, edges combine
                    a.phase = wrap_phase(a.phase + b.phase)
                    for k in b.edges:
                        if k != i and k is not None:
                            if k not in a.edges:
                                a.edges.append(k)
                            # repoint k's edge from b to a
                            if spiders[k] is not None:
                                spiders[k].edges = [
                                    i if e == j else e for e in spiders[k].edges
                                ]
                    a.edges = [e for e in a.edges if e != j and e != i]
                    spiders[j] = None
                    changed = True
                    break
            if changed:
                break

    # rebuild a clean list with re-mapped indices
    keep = [k for k, s in enumerate(spiders) if s is not None]
    remap = {old: new for new, old in enumerate(keep)}
    result = []
    for old in keep:
        s = spiders[old]
        s.edges = sorted({remap[e] for e in s.edges if e in remap})
        s.hadamard_edges = sorted({remap[e] for e in s.hadamard_edges if e in remap})
        result.append(s)
    return result


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def wrap_phase(phase: float) -> float:
    """Keep a phase in the range (-pi, pi] so labels stay tidy."""
    two_pi = 2 * PI
    phase = phase % two_pi
    if phase > PI:
        phase -= two_pi
    # treat tiny floating point dust as exactly zero
    if abs(phase) < 1e-9:
        phase = 0.0
    return phase


def pretty_phase(phase: float) -> str:
    """Turn a radian value into a neat label such as 'pi', 'pi/2', '-pi/4'."""
    phase = wrap_phase(phase)
    if phase == 0.0:
        return "0"
    # try to express as a simple fraction of pi
    for denom in (1, 2, 3, 4, 6, 8):
        for num in range(-2 * denom, 2 * denom + 1):
            if num == 0:
                continue
            if abs(phase - num * PI / denom) < 1e-6:
                frac = _fmt_fraction(num, denom)
                return frac
    return f"{phase:.2f}"


def _fmt_fraction(num: int, denom: int) -> str:
    """Format num/denom * pi nicely, e.g. (1,2) -> 'pi/2', (-1,1) -> '-pi'."""
    sign = "-" if num < 0 else ""
    num = abs(num)
    if denom == 1:
        return f"{sign}pi" if num == 1 else f"{sign}{num}pi"
    if num == 1:
        return f"{sign}pi/{denom}"
    return f"{sign}{num}pi/{denom}"


def describe_circuit(circuit: List[Tuple]) -> str:
    """Return a short, plain-English description of a circuit (for help text)."""
    if not circuit:
        return "Empty circuit - add some gates!"
    parts = []
    for gate in circuit:
        g = normalise_gate(gate)
        name = g[0]
        if name in PARAMETRIC_GATES:
            parts.append(f"{name}({pretty_phase(g[-1])}) on q{g[1]}")
        elif GATE_ARITY[name] == 2:
            parts.append(f"{name} on q{g[1]},q{g[2]}")
        else:
            parts.append(f"{name} on q{g[1]}")
    return "  ->  ".join(parts)


# ---------------------------------------------------------------------------
# A tiny self-test you can run with:  python zx_core.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    demo = [("H", 0), ("CNOT", 0, 1), ("RZ", 1, PI / 2)]
    print("Circuit:", describe_circuit(demo))
    g = build_zx_graph(demo)
    print(f"\nZX-diagram has {len(g)} spiders:")
    for i, sp in enumerate(g):
        print(f"  [{i}] {sp}  -> wired to {sp.edges}")
    print("\nAfter fusion:")
    for i, sp in enumerate(fuse_spiders(g)):
        print(f"  [{i}] {sp}")
