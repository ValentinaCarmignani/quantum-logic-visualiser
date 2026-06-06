"""
Unit tests for the Quantum Logic Visualiser core.

Run them from the `desktop/` folder with either:

    python tests/test_zx.py        # no extra tools needed
    pytest                          # if you have pytest installed

The tests check two things:
  1. The ZX translation builds the spiders we expect.
  2. The simulator agrees with quantum mechanics on famous circuits.
"""

import math
import os
import sys

# allow "python tests/test_zx.py" to find the modules one level up
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np  # noqa: E402

import zx_core as zx  # noqa: E402
from simulator import Simulator, simulate  # noqa: E402

PI = math.pi


# ---------------------------------------------------------------------------
# Gate normalisation / validation
# ---------------------------------------------------------------------------
def test_lowercase_is_accepted():
    # The original bug: a lowercase "h" silently did nothing. Now it works.
    assert zx.normalise_gate(("h", 0)) == ("H", 0)
    assert zx.normalise_gate(("cnot", 0, 1)) == ("CNOT", 0, 1)


def test_unknown_gate_raises_friendly_error():
    try:
        zx.normalise_gate(("FOO", 0))
    except zx.CircuitError as e:
        assert "not a gate" in str(e)
    else:
        raise AssertionError("expected a CircuitError")


def test_two_qubit_needs_two_distinct_qubits():
    try:
        zx.normalise_gate(("CNOT", 1, 1))
    except zx.CircuitError as e:
        assert "different" in str(e)
    else:
        raise AssertionError("expected a CircuitError")


def test_rotation_requires_angle():
    try:
        zx.normalise_gate(("RZ", 0))
    except zx.CircuitError:
        pass
    else:
        raise AssertionError("RZ without an angle should fail")
    assert zx.normalise_gate(("RZ", 0, 1.5)) == ("RZ", 0, 1.5)


# ---------------------------------------------------------------------------
# Gate -> spiders
# ---------------------------------------------------------------------------
def test_z_is_green_pi():
    (sp,) = zx.gate_to_spiders(("Z", 0), 0)
    assert sp.type == zx.Z_SPIDER
    assert abs(sp.phase - PI) < 1e-9


def test_x_is_red_pi():
    (sp,) = zx.gate_to_spiders(("X", 0), 0)
    assert sp.type == zx.X_SPIDER
    assert abs(sp.phase - PI) < 1e-9


def test_cnot_links_green_control_to_red_target():
    control, target = zx.gate_to_spiders(("CNOT", 0, 1), 0)
    assert control.type == zx.Z_SPIDER and control.qubit == 0
    assert target.type == zx.X_SPIDER and target.qubit == 1
    assert 1 in control.edges and 0 in target.edges


def test_hadamard_is_yellow_box():
    (sp,) = zx.gate_to_spiders(("H", 0), 0)
    assert sp.type == zx.H_BOX


def test_graph_wires_consecutive_gates_on_same_qubit():
    g = zx.build_zx_graph([("X", 0), ("Z", 0)])
    assert len(g) == 2
    # the two spiders on qubit 0 should be wired together
    assert 1 in g[0].edges and 0 in g[1].edges


# ---------------------------------------------------------------------------
# Spider fusion
# ---------------------------------------------------------------------------
def test_fusion_merges_same_colour_and_adds_phases():
    # two green spiders (S then S) on one wire should fuse to phase pi
    g = zx.build_zx_graph([("S", 0), ("S", 0)])
    fused = zx.fuse_spiders(g)
    greens = [s for s in fused if s.type == zx.Z_SPIDER]
    assert len(greens) == 1
    assert abs(zx.wrap_phase(greens[0].phase) - PI) < 1e-9


# ---------------------------------------------------------------------------
# Simulator: does the physics check out?
# ---------------------------------------------------------------------------
def _close(probs, expected):
    keys = set(probs) | set(expected)
    return all(abs(probs.get(k, 0.0) - expected.get(k, 0.0)) < 1e-9 for k in keys)


def test_x_flips_zero_to_one():
    assert _close(simulate([("X", 0)], 1), {"1": 1.0})


def test_hadamard_makes_equal_superposition():
    assert _close(simulate([("H", 0)], 1), {"0": 0.5, "1": 0.5})


def test_bell_state():
    # The hello-world of entanglement: |00> + |11>, nothing in |01> or |10>.
    assert _close(simulate([("H", 0), ("CNOT", 0, 1)], 2), {"00": 0.5, "11": 0.5})


def test_ghz_state():
    probs = simulate([("H", 0), ("CNOT", 0, 1), ("CNOT", 1, 2)], 3)
    assert _close(probs, {"000": 0.5, "111": 0.5})


def test_swap_exchanges_qubits():
    # set q0 to |1>, then swap -> q1 should be |1>
    assert _close(simulate([("X", 0), ("SWAP", 0, 1)], 2), {"01": 1.0})


def test_cz_phase_only_no_probability_change():
    # CZ never changes measurement probabilities of computational states
    probs = simulate([("H", 0), ("H", 1), ("CZ", 0, 1)], 2)
    assert _close(probs, {"00": 0.25, "01": 0.25, "10": 0.25, "11": 0.25})


def test_double_hadamard_is_identity():
    assert _close(simulate([("H", 0), ("H", 0)], 1), {"0": 1.0})


def test_s_gate_is_sqrt_of_z():
    # S applied twice equals Z (up to global phase) -> on |+> it flips to |->
    sim = Simulator(1)
    sim.run([("H", 0), ("S", 0), ("S", 0), ("H", 0)])
    assert _close(sim.probabilities(), {"1": 1.0})


def test_rx_pi_equals_x():
    assert _close(simulate([("RX", 0, PI)], 1), {"1": 1.0})


def test_rotation_half_probability():
    probs = simulate([("RX", 0, PI / 2)], 1)
    assert _close(probs, {"0": 0.5, "1": 0.5})


def test_qubit_out_of_range_raises():
    try:
        simulate([("X", 5)], 2)
    except ValueError as e:
        assert "only has" in str(e)
    else:
        raise AssertionError("expected a ValueError for out-of-range qubit")


# ---------------------------------------------------------------------------
# simple runner so no test framework is required
# ---------------------------------------------------------------------------
def _run_all():
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    passed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except Exception as e:  # noqa: BLE001
            print(f"  FAIL  {t.__name__}: {e}")
    print(f"\n{passed}/{len(tests)} tests passed.")
    return passed == len(tests)


if __name__ == "__main__":
    ok = _run_all()
    sys.exit(0 if ok else 1)
