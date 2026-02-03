document.addEventListener('DOMContentLoaded', () => {
  // デモ用：スライダーで割合を変える（不要なら削除OK）
      const slider = document.getElementById("slider");
      const sliderVal = document.getElementById("sliderVal");
      const leftFill = document.getElementById("leftFill");
      const rightFill = document.getElementById("rightFill");
      const leftPct = document.getElementById("leftPct");
      const rightPct = document.getElementById("rightPct");

      const leftScore = document.getElementById("leftScore");
      const rightScore = document.getElementById("rightScore");

      const fmt = (n)=> n.toLocaleString("ja-JP");

      function setPct(left){
        left = Math.max(0, Math.min(100, left));
        const right = 100 - left;

        leftFill.style.width = left + "%";
        rightFill.style.width = right + "%";

        leftPct.textContent = left + "%";
        rightPct.textContent = right + "%";

        // スコアは適当に連動（デモ）
        const base = 20000;
        leftScore.textContent = fmt(Math.round(base * (left/100)));
        rightScore.textContent = fmt(Math.round(base * (right/100)));
      }

      slider.addEventListener("input", () => {
        sliderVal.textContent = slider.value;
        setPct(Number(slider.value));
      });

      setPct(Number(slider.value));
});
