import {
  useMemo,
} from "react";

import type {
  ReportChart,
} from "@velora/contracts";

interface Props {
  chart:
    ReportChart;
}

const COLORS = [
  "#6f4d3f",
  "#b58770",
  "#d8b9a6",
  "#8d766b",
  "#c7a58e",
  "#4d625c",
] as const;

function safeNumber(
  value:
    number |
    undefined,
): number {
  return Number.isFinite(
    value,
  )
    ? value ??
      0
    : 0;
}

export function ReportChartCard({
  chart,
}: Props) {
  const allValues =
    chart.series
      .flatMap(
        (
          series,
        ) =>
          series.data,
      )
      .map(
        Number,
      )
      .filter(
        Number.isFinite,
      );

  const max =
    Math.max(
      1,
      ...allValues.map(
        Math.abs,
      ),
    );

  const lineSeries =
    useMemo(
      () =>
        chart.series.map(
          (
            series,
            seriesIndex,
          ) => {
            const count =
              Math.max(
                1,
                chart.categories
                  .length,
                series.data
                  .length,
              );

            const points =
              series.data.map(
                (
                  raw,
                  index,
                ) => {
                  const x =
                    count ===
                    1
                      ? 300
                      : 48 +
                        (
                          index /
                          (
                            count -
                            1
                          )
                        ) *
                          540;
                  const y =
                    170 -
                    (
                      safeNumber(
                        raw,
                      ) /
                      max
                    ) *
                      125;

                  return {
                    x,
                    y,
                    value:
                      safeNumber(
                        raw,
                      ),
                    label:
                      chart.categories[
                        index
                      ] ??
                      `Punto ${index + 1}`,
                  };
                },
              );

            return {
              name:
                series.name,
              color:
                COLORS[
                  seriesIndex %
                  COLORS.length
                ],
              points,
              polyline:
                points
                  .map(
                    (
                      point,
                    ) =>
                      `${point.x},${point.y}`,
                  )
                  .join(
                    " ",
                  ),
            };
          },
        ),
      [
        chart,
        max,
      ],
    );

  if (
    chart.type ===
    "DONUT"
  ) {
    const values =
      chart.series[0]
        ?.data
        .map(
          (
            value,
          ) =>
            Math.max(
              0,
              safeNumber(
                value,
              ),
            ),
        ) ??
      [];

    const total =
      values.reduce(
        (
          sum,
          value,
        ) =>
          sum +
          value,
        0,
      );

    const legend =
      values.map(
        (
          value,
          index,
        ) => {
          const start =
            total >
            0
              ? (
                  values
                    .slice(
                      0,
                      index,
                    )
                    .reduce(
                      (
                        sum,
                        item,
                      ) =>
                        sum +
                        item,
                      0,
                    ) /
                  total
                ) *
                100
              : 0;

          const end =
            total >
            0
              ? start +
                (
                  value /
                  total
                ) *
                  100
              : 0;

          const color =
            COLORS[
              index %
              COLORS.length
            ];

          return {
            label:
              chart.categories[
                index
              ] ??
              `Segmento ${index + 1}`,
            value,
            color,
            start,
            end,
          };
        },
      );

    const stops =
      legend.map(
        (
          item,
        ) =>
          `${item.color} ${item.start}% ${item.end}%`,
      );

    return (
      <article className="report-chart-card">
        <h3>{chart.title}</h3>
        {total <= 0 ? (
          <p className="report-empty">
            Sin datos para este período.
          </p>
        ) : (
          <div className="donut-layout">
            <div
              className="donut"
              style={{
                background:
                  `conic-gradient(${stops.join(",")})`,
              }}
            >
              <span>
                {total.toLocaleString(
                  "es-BO",
                  {
                    maximumFractionDigits:
                      2,
                  },
                )}
              </span>
            </div>
            <div className="chart-legend">
              {legend.map(
                (
                  item,
                ) => (
                  <span key={item.label}>
                    <i
                      style={{
                        background:
                          item.color,
                      }}
                    />
                    {item.label}:{" "}
                    <strong>
                      {item.value.toLocaleString(
                        "es-BO",
                        {
                          maximumFractionDigits:
                            2,
                        },
                      )}
                    </strong>
                  </span>
                ),
              )}
            </div>
          </div>
        )}
      </article>
    );
  }

  if (
    chart.type ===
    "BAR"
  ) {
    const categories =
      chart.categories;
    const series =
      chart.series;
    const categoryCount =
      Math.max(
        1,
        categories.length,
      );

    return (
      <article className="report-chart-card">
        <h3>{chart.title}</h3>
        {categories.length ===
        0 ? (
          <p className="report-empty">
            Sin datos para este período.
          </p>
        ) : (
          <>
            <div className="bar-chart">
              {categories.map(
                (
                  category,
                  categoryIndex,
                ) => (
                  <div
                    className="bar-group"
                    key={category}
                    title={category}
                    style={{
                      width:
                        `${100 / categoryCount}%`,
                    }}
                  >
                    <div className="bar-stack">
                      {series.map(
                        (
                          item,
                          seriesIndex,
                        ) => {
                          const value =
                            safeNumber(
                              item.data[
                                categoryIndex
                              ],
                            );
                          const height =
                            Math.max(
                              2,
                              (
                                Math.abs(
                                  value,
                                ) /
                                max
                              ) *
                                100,
                            );

                          return (
                            <span
                              key={item.name}
                              className="bar"
                              title={`${item.name}: ${value}`}
                              style={{
                                height:
                                  `${height}%`,
                                background:
                                  COLORS[
                                    seriesIndex %
                                    COLORS.length
                                  ],
                              }}
                            />
                          );
                        },
                      )}
                    </div>
                    <small>
                      {category}
                    </small>
                  </div>
                ),
              )}
            </div>
            <div className="chart-legend horizontal">
              {series.map(
                (
                  item,
                  index,
                ) => (
                  <span key={item.name}>
                    <i
                      style={{
                        background:
                          COLORS[
                            index %
                            COLORS.length
                          ],
                      }}
                    />
                    {item.name}
                  </span>
                ),
              )}
            </div>
          </>
        )}
      </article>
    );
  }

  return (
    <article className="report-chart-card">
      <h3>{chart.title}</h3>
      {chart.categories.length ===
      0 ? (
        <p className="report-empty">
          Sin datos para este período.
        </p>
      ) : (
        <>
          <svg
            className="line-chart"
            viewBox="0 0 640 210"
            role="img"
            aria-label={chart.title}
          >
            <line
              x1="48"
              y1="170"
              x2="588"
              y2="170"
              className="chart-axis"
            />
            {lineSeries.map(
              (
                series,
              ) => (
                <g key={series.name}>
                  <polyline
                    points={
                      series.polyline
                    }
                    fill="none"
                    stroke={
                      series.color
                    }
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {series.points.map(
                    (
                      point,
                    ) => (
                      <circle
                        key={`${series.name}-${point.label}`}
                        cx={point.x}
                        cy={point.y}
                        r="4"
                        fill={
                          series.color
                        }
                      >
                        <title>
                          {`${point.label} · ${series.name}: ${point.value}`}
                        </title>
                      </circle>
                    ),
                  )}
                </g>
              ),
            )}
          </svg>
          <div className="chart-legend horizontal">
            {lineSeries.map(
              (
                series,
              ) => (
                <span key={series.name}>
                  <i
                    style={{
                      background:
                        series.color,
                    }}
                  />
                  {series.name}
                </span>
              ),
            )}
          </div>
        </>
      )}
    </article>
  );
}
