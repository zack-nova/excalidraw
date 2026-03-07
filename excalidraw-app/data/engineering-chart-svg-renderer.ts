import type { EngineeringChartType } from "./engineering-chart-material-model";

const ENGINEERING_CHART_MATERIAL_PREVIEW_PRIMARY_COLOR = "#4c6ef5";

const resolvePreviewColor = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("var(")) {
    return ENGINEERING_CHART_MATERIAL_PREVIEW_PRIMARY_COLOR;
  }

  return trimmed;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const createSimpleChartSvg = ({
  chartType,
  title,
  labels,
  values,
  color,
  width,
  height,
  hasWarnings,
}: {
  chartType: EngineeringChartType;
  title: string;
  labels: string[];
  values: number[];
  color: string;
  width: number;
  height: number;
  hasWarnings: boolean;
}) => {
  const safeColor = resolvePreviewColor(color);
  const safeTitle = escapeXml(title || "图示");
  const x = 36;
  const y = 44;
  const chartWidth = Math.max(1, width - 52);
  const chartHeight = Math.max(1, height - 76);
  const bottom = y + chartHeight;
  const right = x + chartWidth;

  let body = `<rect x="${x}" y="${y}" width="${chartWidth}" height="${chartHeight}" fill="#ffffff" stroke="#d9dee7" rx="6" />`;

  if (labels.length === 0 || values.length === 0) {
    body += `<text x="${x + chartWidth / 2}" y="${y + chartHeight / 2}" text-anchor="middle" fill="#8a93a6" font-size="12">等待变量数据</text>`;
  } else if (chartType === "line") {
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const step = labels.length > 1 ? chartWidth / (labels.length - 1) : chartWidth;
    const points = values
      .map((value, index) => {
        const px = x + index * step;
        const normalized = (value - min) / range;
        const py = bottom - normalized * chartHeight;
        return `${px.toFixed(2)},${py.toFixed(2)}`;
      })
      .join(" ");
    body += `<polyline points="${points}" fill="none" stroke="${safeColor}" stroke-width="2.4" />`;
  } else if (chartType === "bar") {
    const max = Math.max(...values, 1);
    const barCount = values.length;
    const gap = 8;
    const barWidth = (chartWidth - gap * (barCount + 1)) / barCount;
    values.forEach((value, index) => {
      const normalized = value / max;
      const barHeight = clamp(normalized * chartHeight, 2, chartHeight);
      const barX = x + gap + index * (barWidth + gap);
      const barY = bottom - barHeight;
      body += `<rect x="${barX.toFixed(2)}" y="${barY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${safeColor}" rx="2" />`;
    });
  } else if (chartType === "hbar") {
    const max = Math.max(...values, 1);
    const barCount = values.length;
    const gap = 6;
    const barHeight = (chartHeight - gap * (barCount + 1)) / barCount;
    values.forEach((value, index) => {
      const normalized = value / max;
      const barWidth = clamp(normalized * chartWidth, 2, chartWidth);
      const barY = y + gap + index * (barHeight + gap);
      body += `<rect x="${x}" y="${barY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${safeColor}" rx="2" />`;
    });
  } else {
    const sum = values.reduce((total, value) => total + value, 0) || 1;
    const cx = x + chartWidth / 2;
    const cy = y + chartHeight / 2;
    const radius = Math.min(chartWidth, chartHeight) * 0.34;
    let angle = -Math.PI / 2;

    values.forEach((value, index) => {
      const ratio = value / sum;
      const nextAngle = angle + ratio * Math.PI * 2;
      const x1 = cx + radius * Math.cos(angle);
      const y1 = cy + radius * Math.sin(angle);
      const x2 = cx + radius * Math.cos(nextAngle);
      const y2 = cy + radius * Math.sin(nextAngle);
      const largeArc = ratio > 0.5 ? 1 : 0;
      const hue = (index * 67) % 360;
      const sliceColor = `hsl(${hue} 70% 56%)`;
      body += `<path d="M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${sliceColor}" />`;
      angle = nextAngle;
    });
  }

  if (hasWarnings) {
    const badgeX = right - 10;
    const badgeY = y + 10;
    body += `<circle cx="${badgeX}" cy="${badgeY}" r="8" fill="#d9480f" />`;
    body += `<text x="${badgeX}" y="${badgeY + 4}" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="700">!</text>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f7f9fc"/><text x="18" y="24" fill="#1f2430" font-size="13" font-weight="600">${safeTitle}</text>${body}</svg>`;
};

const createChartErrorPlaceholderSvg = ({
  title,
  errorSummary,
  width,
  height,
}: {
  title: string;
  errorSummary: string;
  width: number;
  height: number;
}) => {
  const safeTitle = escapeXml(title || "图示");
  const safeError = escapeXml(errorSummary);
  const lineMaxChars = 20;
  const line1 = safeError.slice(0, lineMaxChars);
  const line2 = safeError.slice(lineMaxChars, lineMaxChars * 2);
  const line3 = safeError.slice(lineMaxChars * 2, lineMaxChars * 3);

  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f8fafc"/><text x="18" y="24" fill="#1f2430" font-size="13" font-weight="600">${safeTitle}</text><rect x="26" y="46" width="${Math.max(10, width - 52)}" height="${Math.max(10, height - 70)}" rx="8" fill="#fff5f5" stroke="#ffccd5"/><text x="40" y="84" fill="#d9480f" font-size="12" font-weight="700">代码执行异常</text><text x="40" y="106" fill="#495057" font-size="11">${line1}</text><text x="40" y="124" fill="#495057" font-size="11">${line2}</text><text x="40" y="142" fill="#495057" font-size="11">${line3}</text></svg>`;
};

const toSvgDataURL = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const renderEngineeringChartPreviewDataURL = ({
  chartType,
  title,
  labels,
  values,
  color,
  width,
  height,
  hasWarnings,
}: {
  chartType: EngineeringChartType;
  title: string;
  labels: string[];
  values: number[];
  color: string;
  width: number;
  height: number;
  hasWarnings: boolean;
}) =>
  toSvgDataURL(
    createSimpleChartSvg({
      chartType,
      title,
      labels,
      values,
      color,
      width,
      height,
      hasWarnings,
    }),
  );

export const renderEngineeringChartErrorDataURL = ({
  title,
  errorSummary,
  width,
  height,
}: {
  title: string;
  errorSummary: string;
  width: number;
  height: number;
}) =>
  toSvgDataURL(
    createChartErrorPlaceholderSvg({
      title,
      errorSummary,
      width,
      height,
    }),
  );
