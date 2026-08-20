// 日別の棒グラフ描画。記録ページの7日間グラフと履歴ページの期間グラフで共用する。
// 依存: formatValue（logic/nutrition.js）。DOM構造には依存せず canvas だけを受け取る。

const CHART_PADDING = { left: 58, right: 12, top: 18, bottom: 36 };

// options:
//   values         … 日ごとの値（棒の高さ）
//   labels         … 棒の下に出すラベル（値と同じ長さ）
//   nutrient       … NUTRIENTS の1件（色・単位・桁数に使う）
//   target         … 目安ライン。0以下なら引かない
//   highlightIndex … 濃い色で強調する棒（今日など）。-1で強調なし
function drawDailyBarChart(canvas, options) {
  const { values, labels, nutrient, target = 0, highlightIndex = -1 } = options;
  if (!canvas || values.length === 0) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(240, Math.floor(rect.width * dpr));
  const height = Math.max(160, Math.floor(rect.height * dpr));

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const cssWidth = width / dpr;
  const cssHeight = height / dpr;
  // 全ての値と目安が0でも高さ計算が NaN にならないように下限を置く。
  const maxValue = Math.max(target, ...values, 0) * 1.18 || 1;
  const chart = {
    ...CHART_PADDING,
    width: cssWidth - CHART_PADDING.left - CHART_PADDING.right,
    height: cssHeight - CHART_PADDING.top - CHART_PADDING.bottom,
  };

  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  drawGrid(ctx, chart, cssWidth, nutrient, maxValue, target);

  const slot = chart.width / values.length;
  const barWidth = Math.max(3, Math.min(slot - 12, slot * 0.72));
  // 月表示は31本並ぶためラベルを全部は置けない。強調する日（今日）を起点に間引くと、
  // 「今日」のラベルと間引き後のラベルが隣り合って重なることがない。
  const labelStep = Math.ceil(values.length / 8);
  const labelAnchor = highlightIndex >= 0 ? highlightIndex : 0;

  const points = values.map((value, index) => {
    const x = chart.left + slot * index + slot / 2;
    const barHeight = (value / maxValue) * chart.height;
    const y = chart.top + chart.height - barHeight;

    ctx.fillStyle = index === highlightIndex ? nutrient.color : "rgba(36, 120, 106, 0.28)";
    roundRect(ctx, x - barWidth / 2, y, barWidth, barHeight, Math.min(6, barWidth / 2));
    ctx.fill();

    const label = labels[index];
    if (label && Math.abs(index - labelAnchor) % labelStep === 0) {
      ctx.fillStyle = "#68746c";
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, x, chart.top + chart.height + 24);
    }

    return { x, y };
  });

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = nutrient.color;
  ctx.lineWidth = 3;
  ctx.stroke();

  // 点が多すぎると線が見えなくなるので、10日を超える期間では丸を省く。
  if (points.length <= 10) {
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = nutrient.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

// 軸ラベル用の短い日付表記（"2026-08-20" → "8/20"）。
function formatShortDate(dateKey) {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function drawGrid(ctx, chart, cssWidth, nutrient, maxValue, target) {
  ctx.strokeStyle = "#e2e9e3";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#68746c";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";

  for (let index = 0; index <= 3; index += 1) {
    const value = (maxValue / 3) * index;
    const y = chart.top + chart.height - (value / maxValue) * chart.height;
    ctx.beginPath();
    ctx.moveTo(chart.left, y);
    ctx.lineTo(cssWidth - chart.right, y);
    ctx.stroke();
    ctx.fillText(formatValue(value, nutrient), chart.left - 8, y + 4);
  }

  if (target <= 0) return;

  const targetY = chart.top + chart.height - (target / maxValue) * chart.height;
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "rgba(218, 111, 80, 0.48)";
  ctx.beginPath();
  ctx.moveTo(chart.left, targetY);
  ctx.lineTo(cssWidth - chart.right, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#b65d43";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("目安ライン", chart.left + 5, Math.max(chart.top + 12, targetY - 6));
}

function roundRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}
