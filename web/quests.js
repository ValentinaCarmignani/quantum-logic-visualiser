/* ===========================================================================
 * quests.js — "Quantum Quests": ten puzzle levels played in the playground.
 *
 * Each level gives a goal (target probability bars), a set of gates the
 * student may use, and sometimes locked starting gates. The level is solved
 * the moment the student's bars match the goal.
 *
 *   ⭐⭐⭐  fewest possible gates (`best`, checked by brute-force search)
 *   ⭐⭐   up to 2 extra gates
 *   ⭐    any other solution
 *
 * Levels unlock in order. Stuck students get two hints, then can reveal the
 * answer: that unlocks the next level but earns no stars, so they can come
 * back later and earn them. Progress is saved on the student's own device.
 * ======================================================================== */
(function () {
  "use strict";

  const STORE_KEY = "qlv-quests";
  const EPS = 1e-6;

  const all8 = {};
  for (let k = 0; k < 8; k++) all8[k.toString(2).padStart(3, "0")] = 1 / 8;

  const LEVELS = [
    {
      title: "Flip it",
      goal: "Turn the qubit into a <b>1</b>, every single time (100% |1⟩).",
      qubits: 1, start: [], allowed: ["X", "H", "Z"], target: { "1": 1 }, best: 1,
      hints: ["Which gate is like turning a coin over?",
              "Try the <b>X</b> gate on qubit 0."],
      answer: [["X", 0]],
      learned: "<b>X</b> is the quantum NOT gate: it flips |0⟩ to |1⟩.",
    },
    {
      title: "Coin toss",
      goal: "Make a fair coin: <b>50%</b> |0⟩ and <b>50%</b> |1⟩.",
      qubits: 1, start: [], allowed: ["H", "X", "Z"], target: { "0": 0.5, "1": 0.5 }, best: 1,
      hints: ["You need the gate that sets the coin spinning.",
              "It's the gate drawn as a yellow box in the ZX-diagram: <b>H</b>."],
      answer: [["H", 0]],
      learned: "<b>H</b> creates superposition: a 50/50 spinning coin.",
    },
    {
      title: "Undo the spin",
      goal: "An H gate is already placed (🔒). Get back to <b>100%</b> |0⟩.",
      qubits: 1, start: [["H", 0]], allowed: ["H", "X", "Z"], target: { "0": 1 }, best: 1,
      hints: ["What happens if you do the same thing twice?",
              "Add a second <b>H</b> on qubit 0."],
      answer: [["H", 0]],
      learned: "<b>H</b> undoes itself: two H gates in a row cancel out.",
    },
    {
      title: "Flip without X",
      goal: "Turn the qubit into a <b>1</b> (100% |1⟩), but there's no X gate this time!",
      qubits: 1, start: [], allowed: ["H", "Z"], target: { "1": 1 }, best: 3,
      hints: ["Z changes the phase, which the bars can't see. H can turn a phase into something you can measure.",
              "Sandwich a <b>Z</b> between two <b>H</b> gates."],
      answer: [["H", 0], ["Z", 0], ["H", 0]],
      learned: "H–Z–H acts exactly like X. In ZX-calculus, the H boxes swap a green spider for a red one!",
    },
    {
      title: "Best friends",
      goal: "Make two qubits that always agree: <b>50%</b> |00⟩ and <b>50%</b> |11⟩.",
      qubits: 2, start: [], allowed: ["H", "X", "CNOT"], target: { "00": 0.5, "11": 0.5 }, best: 2,
      hints: ["Start by putting qubit 0 into superposition.",
              "Then add a <b>CNOT</b> with qubit 0 as control and qubit 1 as target (type <b>0,1</b>)."],
      answer: [["H", 0], ["CNOT", 0, 1]],
      learned: "That's a <b>Bell pair</b>: the qubits are entangled, so they always agree.",
    },
    {
      title: "Opposites attract",
      goal: "Make two qubits that always <i>disagree</i>: <b>50%</b> |01⟩ and <b>50%</b> |10⟩.",
      qubits: 2, start: [], allowed: ["H", "X", "CNOT"], target: { "01": 0.5, "10": 0.5 }, best: 3,
      hints: ["Start from your Best friends recipe.",
              "Then flip one of the qubits with <b>X</b> so they always disagree."],
      answer: [["H", 0], ["X", 1], ["CNOT", 0, 1]],
      learned: "Entangled qubits can be linked any way you like: always the same, or always opposite.",
    },
    {
      title: "All at once",
      goal: "With three qubits, make all <b>8</b> answers equally likely (12.5% each).",
      qubits: 3, start: [], allowed: ["H", "X", "CNOT"], target: all8, best: 3,
      hints: ["Each qubit needs to be a spinning coin.",
              "Put an <b>H</b> on every qubit: 0, 1 and 2."],
      answer: [["H", 0], ["H", 1], ["H", 2]],
      learned: "3 qubits hold 2 × 2 × 2 = <b>8</b> possibilities at once. 50 qubits would hold over a quadrillion!",
    },
    {
      title: "Team of three",
      goal: "Make three qubits that always agree: <b>50%</b> |000⟩ and <b>50%</b> |111⟩.",
      qubits: 3, start: [], allowed: ["H", "X", "CNOT"], target: { "000": 0.5, "111": 0.5 }, best: 3,
      hints: ["Make Best friends with qubits 0 and 1 first, then bring in qubit 2.",
              "<b>H</b> on 0, <b>CNOT 0,1</b>, then one more CNOT that targets qubit 2."],
      answer: [["H", 0], ["CNOT", 0, 1], ["CNOT", 0, 2]],
      learned: "That's a <b>GHZ state</b>: three qubits entangled as one team.",
    },
    {
      title: "Phase detective",
      goal: "Turn the qubit into a <b>1</b> (100% |1⟩) using only H and S.",
      qubits: 1, start: [], allowed: ["H", "S"], target: { "1": 1 }, best: 4,
      hints: ["S turns the phase by π/2. Two S gates in a row add up to π, which is exactly a Z gate!",
              "Remember Flip without X: <b>H</b>, then two <b>S</b> gates, then <b>H</b>."],
      answer: [["H", 0], ["S", 0], ["S", 0], ["H", 0]],
      learned: "Phases add up: π/2 + π/2 = π. Turn on ✨ Simplify and watch the two S spiders merge!",
    },
    {
      title: "Swap with CNOTs",
      goal: "Qubit 0 starts as a 1 (🔒). Move the 1 over to qubit 1: <b>100%</b> |01⟩.",
      qubits: 2, start: [["X", 0]], allowed: ["CNOT"], target: { "01": 1 }, best: 2,
      hints: ["CNOT flips its target only when its control is 1.",
              "First copy the 1 onto qubit 1 with <b>CNOT 0,1</b>, then use qubit 1 to clear qubit 0 with <b>CNOT 1,0</b>."],
      answer: [["CNOT", 0, 1], ["CNOT", 1, 0]],
      learned: "CNOTs can move information between qubits. Three of them make a full SWAP!",
    },
  ];

  /* ---- saved progress: { stars: {levelIndex: 1..3}, helped: {levelIndex: true} } ---- */
  function load() {
    try {
      const p = JSON.parse(localStorage.getItem(STORE_KEY));
      if (p && p.stars && p.helped) return p;
    } catch (_) { /* storage blocked: start fresh */ }
    return { stars: {}, helped: {} };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (_) { /* ignore */ }
  }
  const progress = load();

  const done = (i) => !!(progress.stars[i] || progress.helped[i]);
  const unlocked = (i) => i === 0 || done(i - 1);
  const totalStars = () => Object.values(progress.stars).reduce((a, b) => a + b, 0);
  const starText = (n) => "⭐".repeat(n) + "☆".repeat(3 - n);

  /* ---- page state ---- */
  const $ = (id) => document.getElementById(id);
  let active = false;      // is quest mode showing?
  let current = 0;         // level index
  let hintsShown = 0;
  let solved = false;      // solved during this attempt (stop checking until retry)
  let revealing = false;   // the answer is being shown: no stars
  let confirmReveal = false;
  let freeplaySnapshot = null;

  /* ===================================================================== */
  /*  Mode switching                                                       */
  /* ===================================================================== */
  function enterQuests() {
    if (active) return;
    active = true;
    freeplaySnapshot = Playground.snapshot();
    setTabs();
    $("quest-panel").hidden = false;
    // open the first level that isn't finished yet
    let i = 0;
    while (i < LEVELS.length - 1 && done(i)) i++;
    startLevel(i);
  }

  function leaveQuests(restore) {
    if (!active) return;
    active = false;
    setTabs();
    $("quest-panel").hidden = true;
    if (restore) {
      Playground.clearPuzzle();
      if (freeplaySnapshot) Playground.restore(freeplaySnapshot);
    }
  }

  function setTabs() {
    $("tab-free").setAttribute("aria-pressed", active ? "false" : "true");
    $("tab-quests").setAttribute("aria-pressed", active ? "true" : "false");
  }

  /* ===================================================================== */
  /*  Levels                                                               */
  /* ===================================================================== */
  function startLevel(i) {
    if (!unlocked(i)) return;
    current = i;
    hintsShown = 0;
    solved = false;
    revealing = false;
    resetRevealButton();
    const L = LEVELS[i];

    $("quest-num").textContent = i + 1;
    $("quest-title").textContent = L.title;
    $("quest-goal").innerHTML = L.goal;
    $("quest-gates").textContent = L.allowed.join(", ");
    $("quest-best").textContent = L.best + (L.best === 1 ? " gate" : " gates");
    $("quest-hints").innerHTML = "";
    $("quest-hint").disabled = false;
    $("quest-hint").textContent = "💡 Hint (2 left)";
    $("quest-win").hidden = true;
    $("quest-record").textContent = progress.stars[i]
      ? "Your best: " + starText(progress.stars[i])
      : progress.helped[i] ? "You've seen the answer. Solve it yourself to earn stars!" : "";

    drawLevelPicker();
    Playground.setPuzzle({ qubits: L.qubits, start: L.start, allowed: L.allowed, target: L.target });
    if (window.A11Y) A11Y.announce("Level " + (i + 1) + ": " + L.title + ". " + L.goal);
  }

  function drawLevelPicker() {
    const box = $("quest-levels");
    box.innerHTML = "";
    LEVELS.forEach((L, i) => {
      const b = document.createElement("button");
      b.className = "level-btn";
      const open = unlocked(i);
      const stars = progress.stars[i] || 0;
      b.disabled = !open;
      if (i === current) b.classList.add("current");
      if (done(i)) b.classList.add("done");
      b.innerHTML = '<span class="level-n">' + (open ? i + 1 : "🔒") + "</span>" +
        '<span class="level-stars' + (!stars && progress.helped[i] ? " helped" : "") + '" aria-hidden="true">' +
        (stars ? "⭐".repeat(stars) : progress.helped[i] ? "👀" : "") + "</span>";
      b.setAttribute("aria-label", "Level " + (i + 1) + ", " + L.title +
        (open ? (stars ? ", " + stars + " stars" : progress.helped[i] ? ", answer seen" : "") : ", locked"));
      if (i === current) b.setAttribute("aria-current", "step");
      b.onclick = () => startLevel(i);
      box.appendChild(b);
    });
    $("quest-star-total").textContent = totalStars() + " / " + LEVELS.length * 3 + " ⭐";
  }

  /* ===================================================================== */
  /*  Checking the student's circuit                                       */
  /* ===================================================================== */
  function matches(probs, target) {
    const keys = new Set(Object.keys(probs).concat(Object.keys(target)));
    for (const k of keys) if (Math.abs((probs[k] || 0) - (target[k] || 0)) > EPS) return false;
    return true;
  }

  function onChange(e) {
    if (!active || solved) return;
    const L = LEVELS[current];
    const added = e.detail.added;
    if (added === 0 || !matches(e.detail.probs, L.target)) return;
    solved = true;

    if (revealing) {
      progress.helped[current] = true;
      save();
      showWin(0, added);
      return;
    }
    const stars = added <= L.best ? 3 : added <= L.best + 2 ? 2 : 1;
    if (stars > (progress.stars[current] || 0)) progress.stars[current] = stars;
    save();
    showWin(stars, added);
    celebrate(stars);
  }

  function showWin(stars, used) {
    const L = LEVELS[current];
    const last = current === LEVELS.length - 1;
    let head, detail;
    if (stars === 0) {
      head = "👀 Here's one way to do it";
      detail = "No stars this time, but the next level is unlocked. Come back and solve it yourself to earn stars!";
    } else {
      head = "🎉 Level complete! " + starText(stars);
      detail = "You used <b>" + used + "</b> gate" + (used === 1 ? "" : "s") +
        (stars === 3 ? ". That's the best possible!" : ". Can you do it in <b>" + L.best + "</b>?");
    }
    $("quest-win-head").innerHTML = head;
    $("quest-win-detail").innerHTML = detail + "<br><span class=\"quest-learned\">💡 " + L.learned + "</span>";
    $("quest-next").hidden = last;
    $("quest-finale").hidden = !(last && LEVELS.every((_, i) => done(i)));
    $("quest-win").hidden = false;
    drawLevelPicker();
    if (window.A11Y) A11Y.announce(head + ". " + detail);
  }

  /* ===================================================================== */
  /*  Help: hints, then the answer                                         */
  /* ===================================================================== */
  function showHint() {
    const L = LEVELS[current];
    if (hintsShown >= L.hints.length) return;
    const p = document.createElement("p");
    p.className = "quest-hint-text";
    p.innerHTML = "💡 <b>Hint " + (hintsShown + 1) + ":</b> " + L.hints[hintsShown];
    $("quest-hints").appendChild(p);
    hintsShown++;
    const left = L.hints.length - hintsShown;
    $("quest-hint").textContent = left ? "💡 Hint (" + left + " left)" : "💡 No hints left";
    $("quest-hint").disabled = !left;
    if (window.A11Y) A11Y.announce(p.innerHTML);
  }

  // Two clicks, so nobody reveals the answer by accident (no pop-up dialogs).
  function revealAnswer() {
    const btn = $("quest-answer");
    if (!confirmReveal) {
      confirmReveal = true;
      btn.textContent = "Sure? No stars for this level";
      btn.classList.add("confirm");
      return;
    }
    resetRevealButton();
    revealing = true;
    solved = false;
    Playground.setMoves(LEVELS[current].answer);
  }

  function resetRevealButton() {
    confirmReveal = false;
    const btn = $("quest-answer");
    btn.textContent = "👀 Show answer";
    btn.classList.remove("confirm");
  }

  /* ===================================================================== */
  /*  Celebration (skipped in Calm mode and with reduced motion)           */
  /* ===================================================================== */
  function celebrate(stars) {
    const calm = document.documentElement.classList.contains("a11y-calm");
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm || reduce) return;
    const layer = document.createElement("div");
    layer.className = "confetti";
    layer.setAttribute("aria-hidden", "true");
    const colours = ["#3ddc84", "#ff5a5f", "#ffd23f", "#7c4dff", "#ff6ad5", "#44e0ff"];
    const n = 40 + stars * 25;
    for (let k = 0; k < n; k++) {
      const piece = document.createElement("i");
      piece.style.left = Math.random() * 100 + "vw";
      piece.style.background = colours[k % colours.length];
      piece.style.animationDelay = Math.random() * 0.4 + "s";
      piece.style.animationDuration = 1.6 + Math.random() * 1.2 + "s";
      piece.style.setProperty("--drift", (Math.random() * 160 - 80) + "px");
      piece.style.setProperty("--spin", (Math.random() * 720 - 360) + "deg");
      if (k % 3 === 0) piece.style.borderRadius = "50%";
      layer.appendChild(piece);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 3400);
  }

  /* ===================================================================== */
  /*  Wiring                                                               */
  /* ===================================================================== */
  function init() {
    if (!$("quest-panel") || !window.Playground) return;
    $("tab-free").onclick = () => leaveQuests(true);
    $("tab-quests").onclick = enterQuests;
    $("quest-hint").onclick = showHint;
    $("quest-answer").onclick = revealAnswer;
    $("quest-retry").onclick = () => startLevel(current);
    $("quest-next").onclick = () => startLevel(Math.min(current + 1, LEVELS.length - 1));
    document.addEventListener("playground:change", onChange);
    // a "Try it!" button or an example was pressed: switch back to free play
    document.addEventListener("playground:freeplay", () => leaveQuests(false));
    drawLevelPicker();
  }

  // exposed for testing in the browser console
  window.Quests = { LEVELS: LEVELS };

  document.addEventListener("DOMContentLoaded", init);
})();
