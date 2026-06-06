"""
Headless smoke test for app.py.

Tkinter needs a display, which a CI server (or this sandbox) doesn't have. So we
swap in a lightweight fake `tkinter` that records calls instead of drawing, then
drive the real application logic: build circuits, add gates, toggle simplify,
load examples and render. If any of the drawing / layout / event code is broken,
this raises - catching bugs that a plain `import` cannot.
"""
import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# --------------------------------------------------------------------------
# Build a fake tkinter that does nothing but stays API-compatible.
# --------------------------------------------------------------------------
class _Var:
    def __init__(self, value=None, **k):
        self._v = value

    def get(self):
        return self._v

    def set(self, v):
        self._v = v


class _Widget:
    def __init__(self, *a, **k):
        self._children = []

    # geometry managers + config are all no-ops
    def pack(self, *a, **k):
        pass

    def grid(self, *a, **k):
        pass

    def pack_propagate(self, *a, **k):
        pass

    def pack_forget(self, *a, **k):
        pass

    def config(self, *a, **k):
        pass

    configure = config

    def insert(self, *a, **k):
        pass

    def delete(self, *a, **k):
        pass

    def get(self, *a, **k):
        return getattr(self, "_text", "0")

    def winfo_width(self):
        return 800

    def winfo_height(self):
        return 360


class _Canvas(_Widget):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.draw_calls = 0

    def create_line(self, *a, **k):
        self.draw_calls += 1

    def create_oval(self, *a, **k):
        self.draw_calls += 1

    def create_rectangle(self, *a, **k):
        self.draw_calls += 1

    def create_text(self, *a, **k):
        self.draw_calls += 1


class _Entry(_Widget):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self._text = ""

    def insert(self, idx, s):
        self._text = str(s)

    def delete(self, *a, **k):
        self._text = ""

    def get(self):
        return self._text


fake = types.ModuleType("tkinter")
fake.Tk = type("Tk", (_Widget,), {
    "title": lambda *a, **k: None,
    "geometry": lambda *a, **k: None,
    "minsize": lambda *a, **k: None,
    "configure": lambda *a, **k: None,
    "update_idletasks": lambda *a, **k: None,
    "after": lambda self, ms, fn=None, *a: None,   # don't recurse animation
    "mainloop": lambda *a, **k: None,
})
fake.Frame = _Widget
fake.Label = _Widget
fake.Button = _Widget
fake.Canvas = _Canvas
fake.Entry = _Entry
fake.Spinbox = _Widget
fake.Checkbutton = _Widget
fake.LabelFrame = _Widget
fake.IntVar = _Var
fake.StringVar = _Var
fake.BooleanVar = _Var
fake.END = "end"
messagebox = types.ModuleType("tkinter.messagebox")
_warnings = []
messagebox.showwarning = lambda title, msg: _warnings.append((title, msg))
messagebox.showinfo = lambda *a, **k: None
fake.messagebox = messagebox
ttk = types.ModuleType("tkinter.ttk")
ttk.Combobox = _Widget
fake.ttk = ttk

sys.modules["tkinter"] = fake
sys.modules["tkinter.messagebox"] = messagebox
sys.modules["tkinter.ttk"] = ttk


# --------------------------------------------------------------------------
# Now import and drive the real app.
# --------------------------------------------------------------------------
import app  # noqa: E402


def run():
    a = app.QuantumVisualiser()

    # 1. load each example and render
    for label, data in [("bell", (2, [("H", 0), ("CNOT", 0, 1)])),
                        ("ghz", (3, [("H", 0), ("CNOT", 0, 1), ("CNOT", 1, 2)]))]:
        a._load_example(data)
        assert a.canvas.draw_calls > 0, f"nothing drawn for {label}"

    # 2. add a single-qubit gate via the input path
    a.qubit_count.set(2)
    a._on_qubit_count()
    a.selected_gate.set("H")
    a.q_entry._text = "0"
    a._add_gate()
    assert ("H", 0) in a.circuit

    # 3. add a parametric gate with a friendly angle
    a.selected_gate.set("RZ")
    a.q_entry._text = "1"
    a.angle_entry._text = "pi/2"
    a._add_gate()
    assert any(g[0] == "RZ" for g in a.circuit)

    # 4. add a two-qubit gate
    a.selected_gate.set("CNOT")
    a.q_entry._text = "0,1"
    a._add_gate()
    assert ("CNOT", 0, 1) in a.circuit

    # 5. simplified view should not crash
    a.show_simplified.set(True)
    a._refresh()
    a.show_simplified.set(False)

    # 6. a bad input should be caught and surfaced as a warning, not crash
    before = len(a.circuit)
    a.selected_gate.set("CNOT")
    a.q_entry._text = "0"          # only one qubit -> invalid
    a._add_gate()
    assert len(a.circuit) == before, "invalid gate should not be added"
    assert _warnings, "expected a friendly warning for bad input"

    # 7. an out-of-range qubit should also be rejected gracefully
    a.selected_gate.set("X")
    a.q_entry._text = "9"
    a._add_gate()
    assert all(int(g[1]) < a.num_qubits for g in a.circuit if a._fits(g) or True
               for _ in [0] if g[0] == "X")

    # 8. undo + clear
    a._undo()
    a._clear()
    assert a.circuit == []

    print("smoke_gui: all interactions ran without error")
    print(f"  canvas draw calls: {a.canvas.draw_calls}")
    print(f"  warnings surfaced: {len(_warnings)}")


if __name__ == "__main__":
    run()
    print("PASS")
