"""
app.py  -  The Quantum Logic Visualiser (desktop edition)
=========================================================

A friendly point-and-click window for building quantum circuits and watching
them turn into ZX-diagrams in real time. Built on top of `zx_core.py`
(the diagram logic) and `simulator.py` (the real quantum maths).

Run it with:

    python app.py

No quantum knowledge required to start - just click a gate and press "Add".

This is an educational tool created for Valentina Carmignani's "Big Bang"
project: making quantum computing visual, intuitive and fun for high-school
students.
"""

from __future__ import annotations

import math
import tkinter as tk
from tkinter import messagebox, ttk
from typing import List, Tuple

import zx_core as zx
from simulator import Simulator

# ---------------------------------------------------------------------------
# Look & feel  (bright and welcoming - aimed at teenage learners)
# ---------------------------------------------------------------------------
BG = "#0F1226"          # deep night-blue background
PANEL = "#1B1F3B"       # slightly lighter panels
ACCENT = "#7C4DFF"      # purple highlight
TEXT = "#EAEAFF"        # near-white text
MUTED = "#9AA0C7"       # muted labels
WIRE = "#3A3F66"        # qubit wire colour
GREEN = zx.COLOURS[zx.Z_SPIDER]
RED = zx.COLOURS[zx.X_SPIDER]
YELLOW = zx.COLOURS[zx.H_BOX]

FONT = ("Segoe UI", 11)
FONT_BOLD = ("Segoe UI", 11, "bold")
FONT_TITLE = ("Segoe UI", 20, "bold")

# gates offered in the palette, grouped for clarity
PALETTE = [
    ("Single-qubit", ["H", "X", "Y", "Z", "S", "T"]),
    ("Rotations", ["RX", "RY", "RZ"]),
    ("Two-qubit", ["CNOT", "CZ", "SWAP"]),
]


class QuantumVisualiser(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Quantum Logic Visualiser")
        self.configure(bg=BG)
        self.geometry("1180x760")
        self.minsize(960, 640)

        self.circuit: List[Tuple] = []
        self.num_qubits = 2
        self.show_simplified = tk.BooleanVar(value=False)

        self._build_layout()
        self._refresh()

    # ------------------------------------------------------------------ UI
    def _build_layout(self):
        # ---- title bar ----
        header = tk.Frame(self, bg=BG)
        header.pack(fill="x", padx=18, pady=(14, 4))
        tk.Label(header, text="Quantum Logic Visualiser", bg=BG, fg=TEXT,
                 font=FONT_TITLE).pack(side="left")
        tk.Label(header, text="see quantum gates as ZX-diagrams",
                 bg=BG, fg=MUTED, font=FONT).pack(side="left", padx=12)

        body = tk.Frame(self, bg=BG)
        body.pack(fill="both", expand=True, padx=18, pady=10)

        self._build_controls(body)
        self._build_canvas(body)

    def _build_controls(self, parent):
        panel = tk.Frame(parent, bg=PANEL, width=330)
        panel.pack(side="left", fill="y", padx=(0, 14))
        panel.pack_propagate(False)

        pad = {"padx": 14, "pady": 6}

        # number of qubits
        qrow = tk.Frame(panel, bg=PANEL)
        qrow.pack(fill="x", **pad)
        tk.Label(qrow, text="Qubits:", bg=PANEL, fg=TEXT, font=FONT_BOLD).pack(side="left")
        self.qubit_count = tk.IntVar(value=self.num_qubits)
        tk.Spinbox(qrow, from_=1, to=8, width=4, textvariable=self.qubit_count,
                   command=self._on_qubit_count, font=FONT).pack(side="left", padx=8)

        # gate palette
        for group, gates in PALETTE:
            tk.Label(panel, text=group, bg=PANEL, fg=MUTED,
                     font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(10, 2))
            grid = tk.Frame(panel, bg=PANEL)
            grid.pack(fill="x", padx=10)
            for i, g in enumerate(gates):
                b = tk.Button(grid, text=g, width=6, font=FONT_BOLD,
                              bg=ACCENT, fg="white", relief="flat",
                              activebackground="#5b32d6", cursor="hand2",
                              command=lambda name=g: self._select_gate(name))
                b.grid(row=i // 3, column=i % 3, padx=3, pady=3, sticky="ew")

        # selected-gate / qubit inputs
        sel = tk.LabelFrame(panel, text=" Add a gate ", bg=PANEL, fg=TEXT,
                            font=FONT_BOLD, bd=1, relief="solid")
        sel.pack(fill="x", padx=12, pady=(14, 6))

        self.selected_gate = tk.StringVar(value="H")
        row1 = tk.Frame(sel, bg=PANEL)
        row1.pack(fill="x", padx=8, pady=4)
        tk.Label(row1, text="Gate:", bg=PANEL, fg=TEXT, font=FONT).pack(side="left")
        tk.Label(row1, textvariable=self.selected_gate, bg=PANEL, fg=YELLOW,
                 font=FONT_BOLD, width=8, anchor="w").pack(side="left", padx=6)

        row2 = tk.Frame(sel, bg=PANEL)
        row2.pack(fill="x", padx=8, pady=4)
        tk.Label(row2, text="Qubit(s):", bg=PANEL, fg=TEXT, font=FONT).pack(side="left")
        self.q_entry = tk.Entry(row2, width=10, font=FONT)
        self.q_entry.insert(0, "0")
        self.q_entry.pack(side="left", padx=6)
        tk.Label(row2, text="e.g. 0  or  0,1", bg=PANEL, fg=MUTED,
                 font=("Segoe UI", 8)).pack(side="left")

        self.angle_row = tk.Frame(sel, bg=PANEL)
        tk.Label(self.angle_row, text="Angle:", bg=PANEL, fg=TEXT,
                 font=FONT).pack(side="left")
        self.angle_entry = tk.Entry(self.angle_row, width=10, font=FONT)
        self.angle_entry.insert(0, "pi/2")
        self.angle_entry.pack(side="left", padx=6)
        tk.Label(self.angle_row, text="pi, pi/2, 0.5 ...", bg=PANEL, fg=MUTED,
                 font=("Segoe UI", 8)).pack(side="left")

        tk.Button(sel, text="+  Add gate", bg=GREEN, fg="#06321b",
                  font=FONT_BOLD, relief="flat", cursor="hand2",
                  command=self._add_gate).pack(fill="x", padx=8, pady=(6, 8))

        # action buttons
        actions = tk.Frame(panel, bg=PANEL)
        actions.pack(fill="x", padx=12, pady=4)
        tk.Button(actions, text="Undo", font=FONT, relief="flat", cursor="hand2",
                  bg="#2b2f55", fg=TEXT, command=self._undo).pack(side="left", expand=True, fill="x", padx=2)
        tk.Button(actions, text="Clear", font=FONT, relief="flat", cursor="hand2",
                  bg="#2b2f55", fg=TEXT, command=self._clear).pack(side="left", expand=True, fill="x", padx=2)

        tk.Checkbutton(panel, text="Show simplified diagram (ZX fusion)",
                       variable=self.show_simplified, command=self._refresh,
                       bg=PANEL, fg=TEXT, selectcolor=PANEL, font=FONT,
                       activebackground=PANEL, activeforeground=TEXT).pack(anchor="w", padx=14, pady=6)

        # example circuits
        tk.Label(panel, text="Try an example:", bg=PANEL, fg=MUTED,
                 font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(8, 2))
        ex = tk.Frame(panel, bg=PANEL)
        ex.pack(fill="x", padx=10)
        examples = {
            "Bell pair": (2, [("H", 0), ("CNOT", 0, 1)]),
            "GHZ": (3, [("H", 0), ("CNOT", 0, 1), ("CNOT", 1, 2)]),
            "Superpose": (1, [("H", 0)]),
        }
        for i, (label, data) in enumerate(examples.items()):
            tk.Button(ex, text=label, font=("Segoe UI", 9), relief="flat",
                      bg="#2b2f55", fg=TEXT, cursor="hand2",
                      command=lambda d=data: self._load_example(d)).grid(
                row=0, column=i, padx=3, pady=3, sticky="ew")

        # circuit text
        tk.Label(panel, text="Your circuit:", bg=PANEL, fg=MUTED,
                 font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=14, pady=(10, 2))
        self.circuit_label = tk.Label(panel, text="(empty)", bg=PANEL, fg=TEXT,
                                      font=("Segoe UI", 9), wraplength=300,
                                      justify="left")
        self.circuit_label.pack(anchor="w", padx=14)

        self._update_angle_visibility()

    def _build_canvas(self, parent):
        right = tk.Frame(parent, bg=BG)
        right.pack(side="left", fill="both", expand=True)

        # ZX diagram
        tk.Label(right, text="ZX-diagram", bg=BG, fg=MUTED,
                 font=FONT_BOLD).pack(anchor="w")
        self.canvas = tk.Canvas(right, bg=PANEL, highlightthickness=0, height=360)
        self.canvas.pack(fill="both", expand=True, pady=(2, 10))

        # probabilities
        tk.Label(right, text="If you measured now...", bg=BG, fg=MUTED,
                 font=FONT_BOLD).pack(anchor="w")
        self.state_label = tk.Label(right, text="", bg=BG, fg=YELLOW,
                                    font=("Consolas", 11), anchor="w")
        self.state_label.pack(anchor="w", pady=(2, 2))
        self.prob_canvas = tk.Canvas(right, bg=PANEL, highlightthickness=0, height=170)
        self.prob_canvas.pack(fill="x", pady=(2, 0))

    # -------------------------------------------------------------- events
    def _select_gate(self, name: str):
        self.selected_gate.set(name)
        self._update_angle_visibility()
        # helpful hint in the qubit box
        if zx.GATE_ARITY[name] == 2 and "," not in self.q_entry.get():
            self.q_entry.delete(0, tk.END)
            self.q_entry.insert(0, "0,1")

    def _update_angle_visibility(self):
        if self.selected_gate.get() in zx.PARAMETRIC_GATES:
            self.angle_row.pack(fill="x", padx=8, pady=4)
        else:
            self.angle_row.pack_forget()

    def _on_qubit_count(self):
        self.num_qubits = int(self.qubit_count.get())
        # drop any gates that now reference a missing qubit
        self.circuit = [g for g in self.circuit if self._fits(g)]
        self._refresh()

    def _fits(self, gate) -> bool:
        g = zx.normalise_gate(gate)
        qubits = g[1:1 + zx.GATE_ARITY[g[0]]]
        return all(int(q) < self.num_qubits for q in qubits)

    def _parse_angle(self, text: str) -> float:
        """Accept friendly angles like 'pi', 'pi/2', '-pi/4' or plain numbers."""
        t = text.strip().lower().replace(" ", "")
        if not t:
            raise ValueError("Please type an angle, e.g. pi/2")
        t = t.replace("pi", str(math.pi))
        # only allow safe arithmetic characters
        if not all(c in "0123456789.+-*/()" for c in t):
            raise ValueError(f"'{text}' is not a valid angle.")
        try:
            return float(eval(t, {"__builtins__": {}}, {}))  # noqa: S307
        except Exception:
            raise ValueError(f"'{text}' is not a valid angle.")

    def _add_gate(self):
        name = self.selected_gate.get()
        raw = self.q_entry.get().strip()
        try:
            if zx.GATE_ARITY[name] == 2:
                parts = [p for p in raw.replace(" ", "").split(",") if p != ""]
                if len(parts) != 2:
                    raise zx.CircuitError(
                        f"{name} needs two qubits separated by a comma, e.g. 0,1")
                qubits = [int(parts[0]), int(parts[1])]
            else:
                qubits = [int(raw)]

            gate = [name, *qubits]
            if name in zx.PARAMETRIC_GATES:
                gate.append(self._parse_angle(self.angle_entry.get()))

            gate = zx.normalise_gate(tuple(gate))
            if not self._fits(gate):
                raise zx.CircuitError(
                    f"This circuit has {self.num_qubits} qubits "
                    f"(0..{self.num_qubits - 1}). Add more qubits first.")
            self.circuit.append(gate)
            self._refresh(animate=True)
        except (zx.CircuitError, ValueError) as e:
            messagebox.showwarning("Hmm, try again", str(e))

    def _undo(self):
        if self.circuit:
            self.circuit.pop()
            self._refresh()

    def _clear(self):
        self.circuit = []
        self._refresh()

    def _load_example(self, data):
        n, circ = data
        self.num_qubits = n
        self.qubit_count.set(n)
        self.circuit = list(circ)
        self._refresh(animate=True)

    # ------------------------------------------------------------- drawing
    def _refresh(self, animate: bool = False):
        self.circuit_label.config(
            text=zx.describe_circuit(self.circuit) if self.circuit else "(empty)")
        graph = zx.build_zx_graph(self.circuit)
        if self.show_simplified.get():
            graph = zx.fuse_spiders(graph)
        self._layout(graph)
        self._draw_graph(graph, animate)
        self._draw_probabilities()

    def _layout(self, graph: List[zx.Spider]):
        """Give every spider an (x, y) pixel position."""
        self.update_idletasks()
        w = max(self.canvas.winfo_width(), 600)
        h = max(self.canvas.winfo_height(), 300)
        left, right = 90, w - 50
        top = 60
        row_h = max(60, (h - 110) / max(1, self.num_qubits))

        # spread spiders along x; stack same-qubit/same-column ones slightly
        columns = sorted({s.column for s in graph})
        col_x = {}
        if columns:
            step = (right - left) / max(1, len(columns))
            for i, c in enumerate(columns):
                col_x[c] = left + i * step + step / 2

        seen = {}
        for s in graph:
            base = col_x.get(s.column, (left + right) / 2)
            key = (s.column, s.qubit)
            k = seen.get(key, 0)
            seen[key] = k + 1
            s.x = base + k * 26
            s.y = top + s.qubit * row_h

    def _draw_graph(self, graph: List[zx.Spider], animate: bool):
        c = self.canvas
        c.delete("all")
        self.update_idletasks()
        w = max(c.winfo_width(), 600)

        # qubit wires + labels
        top = 60
        h = max(c.winfo_height(), 300)
        row_h = max(60, (h - 110) / max(1, self.num_qubits))
        for q in range(self.num_qubits):
            y = top + q * row_h
            c.create_line(70, y, w - 40, y, fill=WIRE, width=2)
            c.create_text(40, y, text=f"q{q}", fill=MUTED, font=FONT_BOLD)
            c.create_text(70, y - 18, text="|0>", fill=MUTED, font=("Consolas", 10))

        if not graph:
            c.create_text(w / 2, h / 2,
                          text="Click a gate, choose a qubit, press  + Add gate",
                          fill=MUTED, font=FONT)
            return

        # edges first (so they sit behind the nodes)
        for i, s in enumerate(graph):
            for j in s.edges:
                if j <= i or j >= len(graph):
                    continue
                t = graph[j]
                is_h = j in s.hadamard_edges
                c.create_line(s.x, s.y, t.x, t.y,
                              fill=YELLOW if is_h else WIRE,
                              width=3 if is_h else 2,
                              dash=(4, 3) if is_h else None)
                if is_h:  # little yellow Hadamard box on the edge
                    mx, my = (s.x + t.x) / 2, (s.y + t.y) / 2
                    c.create_rectangle(mx - 7, my - 7, mx + 7, my + 7,
                                       fill=YELLOW, outline="")

        # nodes
        order = list(range(len(graph)))
        self._draw_nodes(graph, order, 0 if animate else len(order))

    def _draw_nodes(self, graph, order, upto):
        c = self.canvas
        for idx in order[:upto]:
            self._draw_one_node(graph[idx])
        if upto < len(order):
            # reveal one more node every 120 ms for a gentle "build" animation
            self.after(120, lambda: self._draw_nodes(graph, order, upto + 1))

    def _draw_one_node(self, s: zx.Spider):
        c = self.canvas
        r = 17
        if s.type == zx.H_BOX:
            c.create_rectangle(s.x - r, s.y - r, s.x + r, s.y + r,
                               fill=YELLOW, outline="white", width=2)
            c.create_text(s.x, s.y, text="H", fill="#3a2f00", font=FONT_BOLD)
        else:
            c.create_oval(s.x - r, s.y - r, s.x + r, s.y + r,
                          fill=s.colour, outline="white", width=2)
            label = s.phase_label()
            if label != "0":
                c.create_text(s.x, s.y, text=label, fill="#06210f" if s.type == zx.Z_SPIDER else "#3a0008",
                              font=("Segoe UI", 8, "bold"))

    def _draw_probabilities(self):
        c = self.prob_canvas
        c.delete("all")
        self.update_idletasks()
        w = max(c.winfo_width(), 600)
        h = max(c.winfo_height(), 150)

        try:
            sim = Simulator(self.num_qubits)
            sim.run(self.circuit)
            probs = sim.probabilities()
            ket = sim.ket_string()
        except Exception as e:  # noqa: BLE001
            c.create_text(w / 2, h / 2, text=str(e), fill=RED, font=FONT)
            self.state_label.config(text="")
            return

        self.state_label.config(text="state:  " + ket)

        if not probs:
            return
        items = sorted(probs.items())
        n = len(items)
        bar_w = min(70, (w - 80) / max(1, n))
        gap = bar_w * 0.3
        total_w = n * bar_w + (n - 1) * gap
        x0 = (w - total_w) / 2
        base_y = h - 28
        max_h = h - 55

        for i, (bits, p) in enumerate(items):
            x = x0 + i * (bar_w + gap)
            bh = max(2, p * max_h)
            # gradient-ish: brighter for higher probability
            c.create_rectangle(x, base_y - bh, x + bar_w, base_y,
                               fill=ACCENT, outline="")
            c.create_text(x + bar_w / 2, base_y - bh - 10,
                          text=f"{p*100:.0f}%", fill=TEXT, font=("Segoe UI", 9, "bold"))
            c.create_text(x + bar_w / 2, base_y + 12,
                          text=f"|{bits}>", fill=MUTED, font=("Consolas", 10))


def main():
    app = QuantumVisualiser()
    app.mainloop()


if __name__ == "__main__":
    main()
