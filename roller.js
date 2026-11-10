var VampireRoller = (function () {
  "use strict";

  var OUTCOMES = {
    success: "Success",
    critical: "Critical",
    messy: "Messy Critical",
    failure: "Failure",
    bestial: "Bestial Failure"
  };

  function rollD10() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      var buf = new Uint32Array(1);
      var limit = Math.floor(0x100000000 / 10) * 10;
      var n;
      do {
        crypto.getRandomValues(buf);
        n = buf[0];
      } while (n >= limit);
      return (n % 10) + 1;
    }
    return Math.floor(Math.random() * 10) + 1;
  }

  function clamp(value, min, max, fallback) {
    var n = Number(value);
    if (!Number.isInteger(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function rollPool(pool, hunger) {
    var hungerDice = Math.min(hunger, pool);
    var dice = [];
    var i;
    for (i = 0; i < pool - hungerDice; i += 1) {
      dice.push({ hunger: false, value: rollD10() });
    }
    for (i = 0; i < hungerDice; i += 1) {
      dice.push({ hunger: true, value: rollD10() });
    }
    return resolveRoll(dice, pool, hunger);
  }

  function resolveRoll(dice, pool, hunger) {
    var hits = 0;
    var tens = [];
    var hungerTens = 0;
    var hungerOnes = 0;
    var i;

    for (i = 0; i < dice.length; i += 1) {
      var die = dice[i];
      die.paired = false;
      if (die.value >= 6) hits += 1;
      if (die.value === 10) tens.push(i);
      if (die.hunger && die.value === 10) hungerTens += 1;
      if (die.hunger && die.value === 1) hungerOnes += 1;
    }

    tens.sort(function (a, b) {
      return Number(dice[b].hunger) - Number(dice[a].hunger);
    });
    var pairCount = Math.floor(tens.length / 2);
    for (i = 0; i + 1 < tens.length; i += 2) {
      dice[tens[i]].paired = true;
      dice[tens[i + 1]].paired = true;
    }

    var bonus = pairCount * 2;
    var total = hits + bonus;
    var outcome;
    if (total === 0 && hungerOnes > 0) outcome = "bestial";
    else if (total === 0) outcome = "failure";
    else if (pairCount > 0 && hungerTens > 0) outcome = "messy";
    else if (pairCount > 0) outcome = "critical";
    else outcome = "success";

    return {
      dice: dice,
      pool: pool,
      hunger: hunger,
      hitCount: hits,
      pairCount: pairCount,
      bonus: bonus,
      total: total,
      hungerOnes: hungerOnes,
      outcome: outcome
    };
  }

  function successWord(n) {
    return n === 1 ? "1 success" : n + " successes";
  }

  function formula(result) {
    if (result.outcome === "bestial") {
      return result.hungerOnes === 1
        ? "A hunger die shows 1."
        : result.hungerOnes + " hunger dice show 1.";
    }
    if (result.total === 0) return "No die shows 6 or higher.";
    if (result.pairCount === 0) return "";
    var pairs = result.pairCount === 1 ? "1 pair of 10s" : result.pairCount + " pairs of 10s";
    return successWord(result.hitCount) + " on the dice + " + result.bonus + " from " + pairs + " = " + result.total + ".";
  }

  function potentialLabel(result) {
    if (result.hungerOnes === 0 || result.outcome === "bestial") return "";
    return "Potential Bestial Failure";
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function mount() {
    var poolInput = document.getElementById("pool");
    var poolDec = document.getElementById("pool-dec");
    var poolInc = document.getElementById("pool-inc");
    var hungerHint = document.getElementById("hunger-hint");
    var hungerButtons = document.querySelectorAll("[data-hunger]");
    var form = document.getElementById("roller");
    var rollBtn = document.getElementById("roll-btn");
    var rollPlain = document.getElementById("roll-plain");
    var empty = document.getElementById("empty");
    var groups = document.getElementById("groups");
    var resultEl = document.getElementById("result");
    var stage = document.getElementById("stage");
    var log = document.getElementById("log");
    var logList = document.getElementById("log-list");
    var clearLog = document.getElementById("clear-log");

    var pool = 5;
    var hunger = 1;
    var history = [];
    var token = 0;

    function setHunger(next) {
      hunger = clamp(next, 0, 5, hunger);
      hungerButtons.forEach(function (button) {
        var value = Number(button.getAttribute("data-hunger"));
        var pressed = value === 0 ? hunger === 0 : value <= hunger;
        button.setAttribute("aria-pressed", pressed ? "true" : "false");
      });
      if (hunger > pool) {
        hungerHint.textContent = "Hunger " + hunger + " — every die is a hunger die.";
      } else if (hunger === 0) {
        hungerHint.textContent = "No hunger dice.";
      } else if (hunger === 1) {
        hungerHint.textContent = "1 die becomes a hunger die.";
      } else {
        hungerHint.textContent = hunger + " dice become hunger dice.";
      }
    }

    function setPool(next) {
      pool = clamp(next, 1, 30, pool);
      poolInput.value = String(pool);
      poolDec.disabled = pool <= 1;
      poolInc.disabled = pool >= 30;
      rollBtn.textContent = pool === 1 ? "Roll 1 die" : "Roll " + pool + " dice";
      setHunger(hunger);
    }

    function dieTag(die) {
      if (die.hunger && die.value === 1) return "Beast";
      if (die.paired && die.hunger) return "Messy";
      if (die.paired) return "Crit";
      return "";
    }

    function dieClass(die, rolling) {
      var names = ["die"];
      if (die.hunger) names.push("hunger");
      if (rolling) {
        names.push("rolling");
        return names.join(" ");
      }
      if (die.value === 1 && die.hunger) names.push("beast");
      else if (die.paired) names.push("paired", "ten", "hit");
      else if (die.value === 10) names.push("ten", "hit");
      else if (die.value >= 6) names.push("hit");
      else names.push("fail");
      return names.join(" ");
    }

    function dieLabel(die) {
      var kind = die.hunger ? "Hunger die" : "Die";
      var face = kind + " showing " + die.value;
      if (die.hunger && die.value === 1) return face + ", potential bestial failure";
      if (die.paired && die.hunger) return face + ", part of a messy critical";
      if (die.paired) return face + ", part of a critical pair";
      if (die.value >= 6) return face + ", success";
      return face;
    }

    function renderDice(result, rolling) {
      var normal = [];
      var red = [];
      result.dice.forEach(function (die) {
        (die.hunger ? red : normal).push(die);
      });
      normal.sort(function (a, b) { return b.value - a.value; });
      red.sort(function (a, b) { return b.value - a.value; });

      var html = "";
      function group(label, dice) {
        if (!dice.length) return;
        html += '<div class="group"><p class="group-label">' + label + "</p><div class=\"group-dice\">";
        dice.forEach(function (die) {
          var shown = rolling ? rollD10() : die.value;
          var tag = rolling ? "" : dieTag(die);
          html += '<div class="' + dieClass(die, rolling) + '" role="img" aria-label="' + (rolling ? (die.hunger ? "Hunger die, rolling" : "Die, rolling") : dieLabel(die)) + '">';
          html += '<span class="face">' + shown + '</span><span class="tag">' + tag + "</span></div>";
        });
        html += "</div></div>";
      }
      group(red.length ? "Dice" : "Pool", normal);
      group("Hunger", red);
      groups.innerHTML = html;
      groups.hidden = false;
      if (result.dice.length > 12) groups.setAttribute("data-many", "true");
      else groups.removeAttribute("data-many");
      empty.hidden = true;
    }

    function renderResult(result) {
      var meta = "Pool " + result.pool + " · Hunger " + result.hunger;
      if (result.hunger > result.pool) meta += " · all " + result.pool + " dice are hunger dice";
      resultEl.hidden = false;
      resultEl.setAttribute("data-outcome", result.outcome);
      resultEl.setAttribute("aria-live", "polite");
      var critLine = result.outcome === "messy" || result.outcome === "critical"
        ? OUTCOMES[result.outcome]
        : "";
      var potential = potentialLabel(result);
      resultEl.innerHTML =
        '<p class="result-kicker">' + meta + "</p>" +
        '<p class="total"><b>' + result.total + "</b><span>" + (result.total === 1 ? "success" : "successes") + "</span>" +
        (critLine ? '<span class="crit-line">' + critLine + "</span>" : "") +
        (potential ? '<span class="crit-line beast-line">' + potential + "</span>" : "") +
        "</p>" +
        (formula(result) ? '<p class="detail">' + formula(result) + "</p>" : "");
    }

    function renderLog() {
      if (!history.length) {
        log.hidden = true;
        logList.innerHTML = "";
        return;
      }
      log.hidden = false;
      logList.innerHTML = history.map(function (item) {
        return '<li class="' + item.outcome + '"><span>Pool ' + item.pool + " · Hunger " + item.hunger +
          '</span><strong>' + OUTCOMES[item.outcome] + " · " + successWord(item.total) + "</strong></li>";
      }).join("");
    }

    function finish(result) {
      renderDice(result, false);
      renderResult(result);
      stage.setAttribute("aria-busy", "false");
      history.unshift({
        pool: result.pool,
        hunger: result.hunger,
        total: result.total,
        outcome: result.outcome
      });
      if (history.length > 12) history.length = 12;
      renderLog();
    }

    function roll(hungerDice) {
      var current = ++token;
      var result = rollPool(pool, hungerDice);
      stage.setAttribute("aria-busy", "true");
      resultEl.hidden = true;
      if (prefersReducedMotion()) {
        finish(result);
        return;
      }
      renderDice(result, true);
      var started = performance.now();
      var lastFlicker = 0;
      function frame(now) {
        if (current !== token) return;
        if (now - started >= 700) {
          finish(result);
          return;
        }
        if (now - lastFlicker > 70) {
          renderDice(result, true);
          lastFlicker = now;
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    poolDec.addEventListener("click", function () { setPool(pool - 1); });
    poolInc.addEventListener("click", function () { setPool(pool + 1); });
    poolInput.addEventListener("input", function () {
      var n = Number(poolInput.value);
      if (Number.isInteger(n) && n >= 1 && n <= 30) setPool(n);
    });
    poolInput.addEventListener("blur", function () { setPool(poolInput.value); });
    hungerButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        setHunger(Number(button.getAttribute("data-hunger")));
      });
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      setPool(poolInput.value);
      roll(hunger);
    });
    rollPlain.addEventListener("click", function () {
      setPool(poolInput.value);
      roll(0);
    });
    clearLog.addEventListener("click", function () {
      history = [];
      renderLog();
    });

    setPool(5);
    setHunger(1);
  }

  return {
    mount: mount
  };
})();

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", VampireRoller.mount);
  } else {
    VampireRoller.mount();
  }
}
