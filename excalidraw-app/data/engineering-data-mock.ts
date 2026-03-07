import type { EngineeringData } from "./engineeringData";

export const createMockEngineeringDataFrame = (
  tick: number,
): EngineeringData[] => {
  const pressure = Number((12 + Math.sin(tick / 2) * 3).toFixed(2));
  const current = Number((3 + Math.cos(tick / 3)).toFixed(2));
  const lineLabels = ["08:00", "08:05", "08:10", "08:15", "08:20", "08:25"];
  const lineValues = lineLabels.map((_, index) =>
    Number((13 + Math.sin((tick + index) / 2) * 0.6 + index * 0.02).toFixed(2)),
  );
  const unitPowerLabels = ["1号机", "2号机", "3号机"];
  const unitPowerValues = unitPowerLabels.map((_, index) =>
    Math.round(620 + Math.sin((tick + index) / 3) * 18 + index * 6),
  );
  const auxRateLabels = ["引风机", "给水泵", "循环泵", "一次风机"];
  const auxRateValues = auxRateLabels.map((_, index) =>
    Number((2.5 + Math.cos((tick + index) / 2.4) * 0.25 + index * 0.18).toFixed(2)),
  );
  const fuelMixLabels = ["煤", "天然气", "生物质"];
  const fuelMixCoal = 58 + Math.sin(tick / 5) * 4;
  const fuelMixGas = 27 + Math.cos(tick / 6) * 3;
  const fuelMixBio = 100 - fuelMixCoal - fuelMixGas;
  const fuelMixValues = [fuelMixCoal, fuelMixGas, fuelMixBio].map((value) =>
    Number(value.toFixed(1)),
  );

  return [
    {
      uuid: "550e8400-e29b-41d4-a716-446655440000",
      alias: "pressure",
      name: "pressure",
      value: pressure,
      unit: "kPa",
      description: "Mock inlet pressure",
    },
    {
      uuid: "660e8400-e29b-41d4-a716-446655440000",
      alias: "current",
      name: "current",
      value: current,
      unit: "A",
      description: "Mock motor current",
    },
    {
      uuid: "770e8400-e29b-41d4-a716-446655440000",
      alias: "power",
      name: "power",
      value: Number((pressure * current).toFixed(2)),
      unit: "kW",
      description: "Mock computed power",
    },
    {
      id: "var:chart:main-steam-pressure:labels",
      alias: "plant.boiler.mainSteamPressure.labels",
      name: "mainSteamPressure.labels",
      value: JSON.stringify(lineLabels),
      description: "Mock chart labels for line chart",
    },
    {
      id: "var:chart:main-steam-pressure:values",
      alias: "plant.boiler.mainSteamPressure.values",
      name: "mainSteamPressure.values",
      value: JSON.stringify(lineValues),
      unit: "MPa",
      description: "Mock chart values for line chart",
    },
    {
      id: "var:chart:unit-power:labels",
      alias: "plant.units.power.labels",
      name: "units.power.labels",
      value: JSON.stringify(unitPowerLabels),
      description: "Mock chart labels for bar chart",
    },
    {
      id: "var:chart:unit-power:values",
      alias: "plant.units.power.values",
      name: "units.power.values",
      value: JSON.stringify(unitPowerValues),
      unit: "MW",
      description: "Mock chart values for bar chart",
    },
    {
      id: "var:chart:aux-rate:labels",
      alias: "plant.aux.rate.labels",
      name: "aux.rate.labels",
      value: JSON.stringify(auxRateLabels),
      description: "Mock chart labels for horizontal bar chart",
    },
    {
      id: "var:chart:aux-rate:values",
      alias: "plant.aux.rate.values",
      name: "aux.rate.values",
      value: JSON.stringify(auxRateValues),
      unit: "%",
      description: "Mock chart values for horizontal bar chart",
    },
    {
      id: "var:chart:fuel-mix:labels",
      alias: "plant.fuel.mix.labels",
      name: "fuel.mix.labels",
      value: JSON.stringify(fuelMixLabels),
      description: "Mock chart labels for pie chart",
    },
    {
      id: "var:chart:fuel-mix:values",
      alias: "plant.fuel.mix.values",
      name: "fuel.mix.values",
      value: JSON.stringify(fuelMixValues),
      unit: "%",
      description: "Mock chart values for pie chart",
    },
  ];
};
