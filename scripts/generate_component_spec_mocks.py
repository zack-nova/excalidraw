#!/usr/bin/env python3

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = Path(
    "/Users/miles/Code/Work/electroflow_excalidraw/electrocontrolbackend/static/component_data_list",
)
TARGET_DIR = REPO_ROOT / "excalidraw-app" / "data" / "componentSpecsMock"
SPECS_DIR = TARGET_DIR / "specs"
CURVES_DIR = TARGET_DIR / "curves"


def to_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return None


def normalize_parameter(parameter: dict[str, Any]) -> tuple[dict[str, Any], Any | None]:
    curve_data = parameter.get("curve_data")
    has_curve_data = curve_data not in (None, "", [], {})
    enum_options_raw = parameter.get("enum_options")
    enum_options: list[Any] | None = None
    if isinstance(enum_options_raw, list):
        filtered_options = [
            option for option in enum_options_raw if option not in (None, "")
        ]
        enum_options = filtered_options or None
    elif enum_options_raw not in (None, ""):
        enum_options = [enum_options_raw]

    raw_value_type = parameter.get("value_type")
    value_type = (
        raw_value_type.strip()
        if isinstance(raw_value_type, str) and raw_value_type.strip()
        else "string"
    )
    parameter_id = (
        parameter.get("uuid")
        or parameter.get("tpis_key")
        or parameter.get("name")
        or parameter.get("name_cn")
    )

    normalized = {
      "id": parameter_id,
      "uuid": parameter.get("uuid"),
      "key": parameter.get("tpis_key") or parameter.get("name"),
      "name": parameter.get("name"),
      "nameCn": parameter.get("name_cn"),
      "source": parameter.get("source"),
      "valueType": value_type,
      "unit": parameter.get("unit"),
      "defaultValue": parameter.get("value"),
      "tips": parameter.get("tips"),
      "enumOptions": enum_options,
      "physicalEntityType": parameter.get("physical_entity_type"),
      "group": parameter.get("group"),
      "required": to_bool(parameter.get("require")),
      "inputStatus": parameter.get("input_status"),
      "allowNotDisplay": to_bool(parameter.get("allow_not_display")),
      "tpisKey": parameter.get("tpis_key"),
      "tpisOperationMode": parameter.get("tpis_operation_mode"),
      "tpisExtraInfo": parameter.get("tpis_extra_info"),
      "hasCurveData": has_curve_data,
    }

    return normalized, curve_data if has_curve_data else None


def main() -> None:
    if not SOURCE_DIR.exists():
        raise SystemExit(f"source dir not found: {SOURCE_DIR}")

    if TARGET_DIR.exists():
        shutil.rmtree(TARGET_DIR)

    SPECS_DIR.mkdir(parents=True, exist_ok=True)
    CURVES_DIR.mkdir(parents=True, exist_ok=True)

    manifest: list[dict[str, Any]] = []

    for source_path in sorted(SOURCE_DIR.glob("*.json")):
        with source_path.open("r", encoding="utf-8") as source_file:
            raw = json.load(source_file)

        component_type = source_path.stem
        spec: dict[str, Any] = {
            "componentType": component_type,
            "id": raw.get("id"),
            "uuid": raw.get("uuid"),
            "group": raw.get("group"),
            "icon": raw.get("icon"),
            "measured": raw.get("measured"),
            "operationMode": raw.get("operation_mode"),
            "data": raw.get("data"),
            "inputParameters": [],
            "outputParameters": [],
        }
        curves_by_parameter_id: dict[str, Any] = {}

        for source_key, target_key in (
            ("input_parameters", "inputParameters"),
            ("output_parameters", "outputParameters"),
        ):
            for parameter in raw.get(source_key, []):
                normalized_parameter, curve_data = normalize_parameter(parameter)
                spec[target_key].append(normalized_parameter)

                if curve_data is not None and normalized_parameter["id"]:
                    curves_by_parameter_id[normalized_parameter["id"]] = curve_data

        manifest.append(
            {
                "componentType": component_type,
                "inputCount": len(spec["inputParameters"]),
                "outputCount": len(spec["outputParameters"]),
                "curveParameterCount": len(curves_by_parameter_id),
                "specPath": f"./specs/{component_type}.json",
                "curvePath": f"./curves/{component_type}.json",
            }
        )

        with (SPECS_DIR / f"{component_type}.json").open("w", encoding="utf-8") as spec_file:
            json.dump(spec, spec_file, ensure_ascii=False, indent=2)
            spec_file.write("\n")

        with (CURVES_DIR / f"{component_type}.json").open("w", encoding="utf-8") as curves_file:
            json.dump(
                {
                    "componentType": component_type,
                    "curvesByParameterId": curves_by_parameter_id,
                },
                curves_file,
                ensure_ascii=False,
                indent=2,
            )
            curves_file.write("\n")

    with (TARGET_DIR / "manifest.json").open("w", encoding="utf-8") as manifest_file:
        json.dump(manifest, manifest_file, ensure_ascii=False, indent=2)
        manifest_file.write("\n")


if __name__ == "__main__":
    main()
