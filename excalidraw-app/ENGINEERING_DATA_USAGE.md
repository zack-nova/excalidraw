# Engineering Data Usage

## Data Source

Frontend receives an `EngineeringData[]` list from the backend.

Each item can include fields such as:

```ts
{
  uuid?: string;
  alias?: string;
  name?: string;
  value?: number | string | boolean | null;
  unit?: string | null;
  group?: string | null;
  measurement?: string | null;
  tags?: Record<string, string> | null;
}
```

## Basic Template Syntax

Dynamic text uses `{{ ... }}` expressions inside Excalidraw text elements.

Examples:

```text
{{pressure}}
{{data[550e8400-e29b-41d4-a716-446655440000].value}}
{{items.pressure.unit}}
{{pressure * current}}
{{round(pressure / 3, 1)}}
```

## Context Objects

Supported expression roots:

- `{{pressure}}`
  Uses the item's `alias` directly.
- `{{data[uuid].value}}`
  Reads a full item by `uuid`.
- `{{items.alias.unit}}`
  Reads the full item by alias.

## Conditional Aggregation

The following helpers are supported:

- `sumWhere(valueField, field1, value1, field2, value2, ...)`
- `countWhere(field1, value1, field2, value2, ...)`
- `avgWhere(valueField, field1, value1, field2, value2, ...)`
- `minWhere(valueField, field1, value1, field2, value2, ...)`
- `maxWhere(valueField, field1, value1, field2, value2, ...)`
- `round(value, digits?)`

Field names must be strings. Nested fields are supported with dot paths such as `"tags.area"`.

Examples:

```text
{{sumWhere("value", "group", "pump")}}
{{countWhere("group", "pump", "tags.area", "A1")}}
{{avgWhere("value", "group", "pump", "measurement", "pressure")}}
{{minWhere("value", "group", "pump")}}
{{maxWhere("value", "group", "pump")}}
{{round(avgWhere("value", "group", "pump", "tags.area", "A1"), 2)}}
```

## Example

If backend sends:

```json
[
  {
    "uuid": "pump-pressure-1",
    "alias": "pressure_1",
    "group": "pump",
    "measurement": "pressure",
    "value": 10.1,
    "tags": { "area": "A1" }
  },
  {
    "uuid": "pump-pressure-2",
    "alias": "pressure_2",
    "group": "pump",
    "measurement": "pressure",
    "value": 20.5,
    "tags": { "area": "A1" }
  },
  {
    "uuid": "pump-pressure-3",
    "alias": "pressure_3",
    "group": "pump",
    "measurement": "pressure",
    "value": 31.2,
    "tags": { "area": "A2" }
  }
]
```

Then this text:

```text
Pump total={{sumWhere("value", "group", "pump")}}
Peak={{maxWhere("value", "group", "pump")}}
Avg A1={{round(avgWhere("value", "group", "pump", "tags.area", "A1"), 2)}}
```

Will render as:

```text
Pump total=61.8
Peak=31.2
Avg A1=15.3
```

## Editing Behavior

- Double-clicking a rendered dynamic text reopens the formula text.
- Leaving edit mode re-applies the latest engineering data values.
- Real-time data updates do not create undo history entries.

## Dev Mock

For development, open:

```text
http://127.0.0.1:3001/?engineeringDataMock=1
```

You can also push data manually in browser devtools:

```js
window.__EXCALIDRAW_ENGINEERING_DATA__.publish([
  {
    uuid: "pump-pressure-1",
    alias: "pressure_1",
    group: "pump",
    value: 10.1,
  },
]);
```
