import { describe, expect, it } from "vitest";

import {
  createEngineeringDataContext,
  renderEngineeringTemplate,
} from "./engineeringData";

describe("engineering data templates", () => {
  it("renders variables, normalized aliases, and arithmetic expressions", () => {
    const context = createEngineeringDataContext([
      {
        uuid: "sensor-pressure-001",
        alias: "pressure",
        name: "pressure",
        value: 12.5,
        unit: "kPa",
      },
      {
        uuid: "sensor-current-001",
        alias: "current",
        name: "current",
        value: 4,
        unit: "A",
      },
      {
        name: "flow-rate",
        value: 10,
      },
    ]);

    expect(
      renderEngineeringTemplate(
        "P={{pressure}} {{items.pressure.unit}}, I={{current}} {{items.current.unit}}, Power={{pressure * current}}, Flow={{flow_rate}}",
        context,
      ),
    ).toBe("P=12.5 kPa, I=4 A, Power=50, Flow=10");
  });

  it("keeps unresolved placeholders and invalid expressions unchanged", () => {
    const context = createEngineeringDataContext([
      {
        uuid: "sensor-temperature-001",
        name: "temperature",
        value: 28,
      },
    ]);

    expect(
      renderEngineeringTemplate(
        "T={{temperature}}, Missing={{unknown_value}}, Broken={{temperature * }}",
        context,
      ),
    ).toBe(
      "T=28, Missing={{unknown_value}}, Broken={{temperature * }}",
    );
  });

  it("supports aliases derived from tpis_key and point_name", () => {
    const context = createEngineeringDataContext([
      {
        uuid: "sensor-pump-speed-001",
        tpis_key: "pump_speed",
        point_name: "main.pump.speed",
        value: 1450,
        unit: "rpm",
      },
    ]);

    expect(
      renderEngineeringTemplate(
        "Speed={{pump_speed}} {{items.pump_speed.unit}}, Point={{main_pump_speed}}",
        context,
      ),
    ).toBe("Speed=1450 rpm, Point=1450");
  });

  it("supports direct alias field and uuid-addressable data map access", () => {
    const pressureUuid = "550e8400-e29b-41d4-a716-446655440000";
    const currentUuid = "660e8400-e29b-41d4-a716-446655440000";
    const context = createEngineeringDataContext([
      {
        uuid: pressureUuid,
        alias: "pressure",
        value: 16,
        unit: "kPa",
      },
      {
        uuid: currentUuid,
        alias: "current",
        value: 5,
        unit: "A",
      },
    ]);

    expect(
      renderEngineeringTemplate(
        `Alias={{pressure}}, UUID={{data[${pressureUuid}].value}}, Quoted={{data["${currentUuid}"].value}}, Calc={{data[${pressureUuid}].value * current}}`,
        context,
      ),
    ).toBe("Alias=16, UUID=16, Quoted=5, Calc=80");
  });

  it("supports conditional aggregations and round()", () => {
    const context = createEngineeringDataContext([
      {
        uuid: "pump-pressure-1",
        alias: "pressure_1",
        group: "pump",
        measurement: "pressure",
        value: 10.1,
        tags: {
          area: "A1",
        },
      },
      {
        uuid: "pump-pressure-2",
        alias: "pressure_2",
        group: "pump",
        measurement: "pressure",
        value: 20.5,
        tags: {
          area: "A1",
        },
      },
      {
        uuid: "pump-pressure-3",
        alias: "pressure_3",
        group: "pump",
        measurement: "pressure",
        value: 31.2,
        tags: {
          area: "A2",
        },
      },
      {
        uuid: "valve-pressure-1",
        alias: "valve_pressure",
        group: "valve",
        measurement: "pressure",
        value: 8.5,
        tags: {
          area: "A1",
        },
      },
    ]);

    expect(
      renderEngineeringTemplate(
        'Sum={{sumWhere("value", "group", "pump")}}, Count={{countWhere("group", "pump", "tags.area", "A1")}}, Avg={{round(avgWhere("value", "group", "pump", "tags.area", "A1"), 2)}}, Min={{minWhere("value", "group", "pump")}}, Max={{maxWhere("value", "group", "pump")}}, Rounded={{round(pressure_1 / 3, 1)}}',
        context,
      ),
    ).toBe(
      "Sum=61.8, Count=2, Avg=15.3, Min=10.1, Max=31.2, Rounded=3.4",
    );
  });
});
