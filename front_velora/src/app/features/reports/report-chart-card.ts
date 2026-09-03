import {
  Component,
  computed,
  input
} from '@angular/core';

import {
  ReportChart
} from '../../core/reports/report.models';

interface AxisLabel {
  text: string;
  x: number;
}

interface LinePoint {
  x: number;
  y: number;
  value: number;
  label: string;
}

interface LineSeriesView {
  name: string;
  color: string;
  points: string;
  dots: LinePoint[];
}

interface BarView {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  label: string;
  seriesName: string;
  color: string;
}

interface LegendItem {
  label: string;
  value: number | null;
  color: string;
}

interface DonutSegment {
  label: string;
  value: number;
  percent: number;
  dashArray: string;
  dashOffset: number;
  color: string;
}

@Component({
  selector: 'app-report-chart-card',
  standalone: true,
  templateUrl: './report-chart-card.html',
  styleUrl: './report-chart-card.scss'
})
export class ReportChartCard {
  readonly chart =
    input.required<ReportChart>();

  private readonly colors = [
    '#6f4d3f',
    '#b58770',
    '#d8b9a6',
    '#8d766b',
    '#c7a58e',
    '#4d625c'
  ];

  readonly extent =
    computed(() => {
      const values =
        this.chart()
          .series
          .flatMap(
            (series) =>
              series.data
                .map((value) => Number(value))
                .filter(Number.isFinite)
          );

      const min =
        Math.min(
          0,
          ...values
        );

      const max =
        Math.max(
          0,
          ...values
        );

      return {
        min,
        max,
        range:
          max === min
            ? 1
            : max - min
      };
    });

  readonly zeroY =
    computed(() =>
      this.scaleY(0)
    );

  readonly lineSeries =
    computed<LineSeriesView[]>(() => {
      const chart =
        this.chart();

      const maxPoints =
        Math.max(
          1,
          chart.categories.length,
          ...chart.series.map(
            (series) => series.data.length
          )
        );

      return chart.series.map(
        (series, seriesIndex) => {
          const dots =
            series.data.map(
              (rawValue, pointIndex) => {
                const value =
                  this.safeNumber(rawValue);

                return {
                  x: this.scaleX(
                    pointIndex,
                    maxPoints
                  ),
                  y: this.scaleY(value),
                  value,
                  label:
                    chart.categories[
                      pointIndex
                    ] ??
                    `Punto ${pointIndex + 1}`
                };
              }
            );

          return {
            name: series.name,
            color:
              this.colorFor(seriesIndex),
            points:
              dots
                .map(
                  (point) =>
                    `${point.x},${point.y}`
                )
                .join(' '),
            dots
          };
        }
      );
    });

  readonly bars =
    computed<BarView[]>(() => {
      const chart =
        this.chart();

      const categoryCount =
        Math.max(
          1,
          chart.categories.length
        );

      const seriesCount =
        Math.max(
          1,
          chart.series.length
        );

      const plotLeft = 46;
      const plotWidth = 560;
      const groupWidth =
        plotWidth / categoryCount;

      const usableGroupWidth =
        groupWidth * 0.72;

      const barWidth =
        Math.max(
          3,
          Math.min(
            34,
            usableGroupWidth / seriesCount
          )
        );

      const result: BarView[] = [];

      chart.categories.forEach(
        (label, categoryIndex) => {
          chart.series.forEach(
            (series, seriesIndex) => {
              const value =
                this.safeNumber(
                  series.data[
                    categoryIndex
                  ] ??
                  0
                );

              const valueY =
                this.scaleY(value);

              const baseline =
                this.zeroY();

              const groupStart =
                plotLeft +
                categoryIndex * groupWidth +
                (
                  groupWidth -
                  barWidth * seriesCount
                ) /
                  2;

              result.push({
                x:
                  groupStart +
                  seriesIndex * barWidth,
                y:
                  Math.min(
                    valueY,
                    baseline
                  ),
                width:
                  Math.max(
                    2,
                    barWidth - 2
                  ),
                height:
                  Math.max(
                    1,
                    Math.abs(
                      baseline -
                      valueY
                    )
                  ),
                value,
                label,
                seriesName:
                  series.name,
                color:
                  this.colorFor(
                    seriesIndex
                  )
              });
            }
          );
        }
      );

      return result;
    });

  readonly xLabels =
    computed<AxisLabel[]>(() => {
      const categories =
        this.chart().categories;

      if (categories.length === 0) {
        return [];
      }

      const maxLabels = 6;

      if (
        categories.length <=
        maxLabels
      ) {
        return categories.map(
          (text, index) => ({
            text,
            x: this.scaleX(
              index,
              categories.length
            )
          })
        );
      }

      const selected:
        AxisLabel[] = [];

      for (
        let step = 0;
        step < maxLabels;
        step++
      ) {
        const index =
          Math.round(
            step *
              (
                categories.length -
                1
              ) /
              (
                maxLabels -
                1
              )
          );

        selected.push({
          text:
            categories[index],
          x: this.scaleX(
            index,
            categories.length
          )
        });
      }

      return selected;
    });

  readonly donutSegments =
    computed<DonutSegment[]>(() => {
      const chart =
        this.chart();

      const values =
        chart.series[0]
          ?.data
          .map(
            (value) =>
              Math.max(
                0,
                this.safeNumber(value)
              )
          ) ??
        [];

      const total =
        values.reduce(
          (sum, value) =>
            sum + value,
          0
        );

      if (total <= 0) {
        return [];
      }

      let offset = 0;

      return values.map(
        (value, index) => {
          const percent =
            value / total * 100;

          const visible =
            Math.max(
              0,
              percent - 0.8
            );

          const segment = {
            label:
              chart.categories[
                index
              ] ??
              `Segmento ${index + 1}`,
            value,
            percent,
            dashArray:
              `${visible} ${100 - visible}`,
            dashOffset:
              -offset,
            color:
              this.colorFor(index)
          };

          offset += percent;

          return segment;
        }
      );
    });

  readonly legend =
    computed<LegendItem[]>(() => {
      const chart =
        this.chart();

      if (chart.type === 'DONUT') {
        return this
          .donutSegments()
          .map(
            (segment) => ({
              label:
                segment.label,
              value:
                segment.value,
              color:
                segment.color
            })
          );
      }

      return chart.series.map(
        (series, index) => ({
          label:
            series.name,
          value: null,
          color:
            this.colorFor(index)
        })
      );
    });

  readonly donutTotal =
    computed(() =>
      this
        .donutSegments()
        .reduce(
          (sum, segment) =>
            sum +
            segment.value,
          0
        )
    );

  formatValue(
    value: number
  ): string {
    if (this.isCurrencyChart()) {
      return new Intl.NumberFormat(
        'es-BO',
        {
          style: 'currency',
          currency: 'BOB',
          maximumFractionDigits: 2
        }
      ).format(value);
    }

    return new Intl.NumberFormat(
      'es-BO',
      {
        maximumFractionDigits: 2
      }
    ).format(value);
  }

  formatPercent(
    value: number
  ): string {
    return new Intl.NumberFormat(
      'es-BO',
      {
        maximumFractionDigits: 1
      }
    ).format(value) + '%';
  }

  colorFor(
    index: number
  ): string {
    return this.colors[
      index %
      this.colors.length
    ];
  }

  private scaleX(
    index: number,
    total: number
  ): number {
    const left = 46;
    const width = 560;

    if (total <= 1) {
      return left + width / 2;
    }

    return (
      left +
      index /
        (total - 1) *
        width
    );
  }

  private scaleY(
    value: number
  ): number {
    const top = 18;
    const height = 190;
    const extent =
      this.extent();

    return (
      top +
      (
        extent.max -
        value
      ) /
        extent.range *
        height
    );
  }

  private safeNumber(
    value: number
  ): number {
    const parsed =
      Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : 0;
  }

  private isCurrencyChart(): boolean {
    const id =
      this.chart()
        .id
        .toLowerCase();

    return (
      id.includes('sales') ||
      id.includes('payment')
    );
  }
}