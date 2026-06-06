"""
simulator.py
============

A tiny, exact quantum simulator.

The ZX-diagram in `zx_core.py` shows students the *shape* of a computation.
This file gives them the *numbers*: it runs the circuit on a real (classically
simulated) quantum state and reports the probability of measuring each outcome.

Seeing the picture and the probabilities side by side is the whole point of the
tool - the diagram stops being abstract once you watch |00> + |11> appear after
a Hadamard and a CNOT (a Bell pair!).

Convention
----------
We use "big-endian" ordering: qubit 0 is the FIRST/top qubit and the LEFT-most
symbol in a ket. So for two qubits the basis is |q0 q1> = |00>, |01>, |10>,
|11>. This matches how the diagram is drawn (q0 on top) and is the least
confusing for beginners.

The only dependency is numpy.
"""

from __future__ import annotations

import cmath
import math
from typing import Dict, List, Tuple

import numpy as np

from zx_core import GATE_ARITY, PARAMETRIC_GATES, normalise_gate

# ---------------------------------------------------------------------------
# Single-qubit gate matrices (2x2)
# ---------------------------------------------------------------------------
_SQRT2 = math.sqrt(2.0)
_I2 = np.array([[1, 0], [0, 1]], dtype=complex)


def _single_qubit_matrix(name: str, angle: float = 0.0) -> np.ndarray:
    """Return the 2x2 unitary for a single-qubit gate."""
    if name == "I":
        return _I2
    if name == "X":
        return np.array([[0, 1], [1, 0]], dtype=complex)
    if name == "Y":
        return np.array([[0, -1j], [1j, 0]], dtype=complex)
    if name == "Z":
        return np.array([[1, 0], [0, -1]], dtype=complex)
    if name == "H":
        return np.array([[1, 1], [1, -1]], dtype=complex) / _SQRT2
    if name == "S":
        return np.array([[1, 0], [0, 1j]], dtype=complex)
    if name == "SDG":
        return np.array([[1, 0], [0, -1j]], dtype=complex)
    if name == "T":
        return np.array([[1, 0], [0, cmath.exp(1j * math.pi / 4)]], dtype=complex)
    if name == "TDG":
        return np.array([[1, 0], [0, cmath.exp(-1j * math.pi / 4)]], dtype=complex)
    if name == "RX":
        c, s = math.cos(angle / 2), math.sin(angle / 2)
        return np.array([[c, -1j * s], [-1j * s, c]], dtype=complex)
    if name == "RY":
        c, s = math.cos(angle / 2), math.sin(angle / 2)
        return np.array([[c, -s], [s, c]], dtype=complex)
    if name == "RZ":
        return np.array([[cmath.exp(-1j * angle / 2), 0],
                         [0, cmath.exp(1j * angle / 2)]], dtype=complex)
    raise ValueError(f"{name} is not a single-qubit gate.")


class Simulator:
    """Exact statevector simulator for a handful of qubits.

    Example
    -------
    >>> sim = Simulator(2)
    >>> sim.run([("H", 0), ("CNOT", 0, 1)])
    >>> sim.probabilities()           # {'00': 0.5, '11': 0.5}
    """

    def __init__(self, num_qubits: int):
        if num_qubits < 1:
            raise ValueError("Need at least one qubit.")
        if num_qubits > 12:
            # 2**12 = 4096 amplitudes is plenty for a classroom tool and keeps
            # the app instant. Beyond this a laptop starts to struggle.
            raise ValueError("This teaching simulator supports up to 12 qubits.")
        self.num_qubits = num_qubits
        self.reset()

    # -- state preparation --------------------------------------------------
    def reset(self) -> None:
        """Put every qubit back to |0>."""
        self.state = np.zeros(2 ** self.num_qubits, dtype=complex)
        self.state[0] = 1.0

    # -- applying gates -----------------------------------------------------
    def _apply_single(self, matrix: np.ndarray, qubit: int) -> None:
        """Apply a 2x2 gate to one qubit using a tensor reshape (fast & exact)."""
        # axis ordering: qubit 0 is the most significant -> axis 0 after reshape
        tensor = self.state.reshape([2] * self.num_qubits)
        tensor = np.tensordot(matrix, tensor, axes=([1], [qubit]))
        tensor = np.moveaxis(tensor, 0, qubit)
        self.state = tensor.reshape(-1)

    def _apply_cnot(self, control: int, target: int) -> None:
        tensor = self.state.reshape([2] * self.num_qubits)
        # where control == 1, apply X (swap) on the target axis
        idx_control1 = [slice(None)] * self.num_qubits
        idx_control1[control] = 1
        sub = tensor[tuple(idx_control1)]
        sub = np.flip(sub, axis=target if target < control else target - 1)
        tensor[tuple(idx_control1)] = sub
        self.state = tensor.reshape(-1)

    def _apply_cz(self, a: int, b: int) -> None:
        tensor = self.state.reshape([2] * self.num_qubits)
        idx = [slice(None)] * self.num_qubits
        idx[a] = 1
        idx[b] = 1
        tensor[tuple(idx)] *= -1
        self.state = tensor.reshape(-1)

    def _apply_swap(self, a: int, b: int) -> None:
        tensor = self.state.reshape([2] * self.num_qubits)
        tensor = np.swapaxes(tensor, a, b)
        self.state = tensor.reshape(-1).copy()

    def apply_gate(self, gate: Tuple) -> None:
        """Apply one gate (tuple form) to the current state."""
        g = normalise_gate(gate)
        name = g[0]
        max_q = max(g[1:1 + GATE_ARITY[name]]) if GATE_ARITY[name] else 0
        if isinstance(max_q, float):
            max_q = int(max_q)
        if max_q >= self.num_qubits:
            raise ValueError(
                f"Gate {name} uses qubit {max_q}, but the circuit only has "
                f"{self.num_qubits} qubit(s) (0..{self.num_qubits - 1})."
            )

        if name in ("CNOT", "CX"):
            self._apply_cnot(g[1], g[2])
        elif name == "CZ":
            self._apply_cz(g[1], g[2])
        elif name == "SWAP":
            self._apply_swap(g[1], g[2])
        else:
            angle = g[2] if name in PARAMETRIC_GATES else 0.0
            self._apply_single(_single_qubit_matrix(name, angle), g[1])

    def run(self, circuit: List[Tuple], reset_first: bool = True) -> None:
        """Run a whole circuit from |00...0>."""
        if reset_first:
            self.reset()
        for gate in circuit:
            self.apply_gate(gate)

    # -- reading the result -------------------------------------------------
    def probabilities(self, threshold: float = 1e-9) -> Dict[str, float]:
        """Return {bitstring: probability} for outcomes that can actually occur."""
        probs = np.abs(self.state) ** 2
        out = {}
        for i, p in enumerate(probs):
            if p > threshold:
                bits = format(i, f"0{self.num_qubits}b")
                out[bits] = float(p)
        return out

    def amplitudes(self, threshold: float = 1e-9) -> Dict[str, complex]:
        """Return {bitstring: complex amplitude} for non-zero terms."""
        out = {}
        for i, amp in enumerate(self.state):
            if abs(amp) ** 2 > threshold:
                bits = format(i, f"0{self.num_qubits}b")
                out[bits] = complex(amp)
        return out

    def ket_string(self, threshold: float = 1e-3, max_terms: int = 8) -> str:
        """Pretty Dirac-notation string, e.g. '0.71|00> + 0.71|11>'."""
        terms = []
        for bits, amp in self.amplitudes(threshold).items():
            mag = abs(amp)
            phase = cmath.phase(amp)
            if abs(phase) < 1e-6:
                coeff = f"{mag:.2f}"
            elif abs(abs(phase) - math.pi) < 1e-6:
                coeff = f"-{mag:.2f}"
            else:
                coeff = f"{mag:.2f}e^(i{phase:.2f})"
            terms.append(f"{coeff}|{bits}>")
            if len(terms) >= max_terms:
                terms.append("...")
                break
        return " + ".join(terms) if terms else "0"


# ---------------------------------------------------------------------------
# convenience one-liner
# ---------------------------------------------------------------------------
def simulate(circuit: List[Tuple], num_qubits: int) -> Dict[str, float]:
    """Run a circuit and return measurement probabilities in one call."""
    sim = Simulator(num_qubits)
    sim.run(circuit)
    return sim.probabilities()


if __name__ == "__main__":
    # The "hello world" of quantum computing: a Bell pair.
    sim = Simulator(2)
    sim.run([("H", 0), ("CNOT", 0, 1)])
    print("Bell state:", sim.ket_string())
    print("Probabilities:", sim.probabilities())
