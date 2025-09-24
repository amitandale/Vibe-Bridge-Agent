// ContextPack v1 schema and constants
// ECMAScript module
export const CTX_PACK_SCHEMA_VERSION = "1.0.0";

export const ALLOWED_SECTIONS = [
  "templates",
  "spec_canvas",
  "diff_slices",
  "linked_tests",
  "contracts",
  "extras"
];

export const ALLOWED_SOURCES = [
  "planner",
  "mcp",
  "fs",
  "git",
  "openapi",
  "sql",
  "llamaindex"
];

// JSON Schema (Draft 2020-12 style). Used for docs. Validator below performs structural checks.
export function getJsonSchema() {
  return {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://vibe/ctxpack.schema.json",
    "title": "ContextPack v1",
    "type": "object",
    "additionalProperties": false,
    "required": ["version","project","pr","mode","order","budgets","must_include","nice_to_have","never_include","provenance","hash"],
    "properties": {
      "version": { "type": "string", "const": CTX_PACK_SCHEMA_VERSION },
      "project": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id"],
        "properties": { "id": { "type": "string", "minLength": 1 } }
      },
      "pr": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id","branch","commit_sha"],
        "properties": {
          "id": { "type": "string", "minLength": 1 },
          "branch": { "type": "string", "minLength": 1 },
          "commit_sha": { "type": "string", "pattern": "^[0-9a-f]{7,40}$" }
        }
      },
      "mode": { "type": "string", "enum": ["MVP","PR","FIX"] },
      "order": {
        "type": "array",
        "minItems": 1,
        "uniqueItems": true,
        "items": { "type": "string", "enum": ALLOWED_SECTIONS }
      },
      "budgets": {
        "type": "object",
        "additionalProperties": false,
        "required": ["max_tokens","max_files","max_per_file_tokens","section_caps"],
        "properties": {
          "max_tokens": { "type": "number", "minimum": 1 },
          "max_files": { "type": "number", "minimum": 0 },
          "max_per_file_tokens": { "type": "number", "minimum": 1 },
          "section_caps": {
            "type": "object",
            "additionalProperties": { "type": "number", "minimum": 0 }
          }
        }
      },
      "must_include": { "$ref": "#/$defs/itemArray" },
      "nice_to_have": { "$ref": "#/$defs/itemArray" },
      "never_include": {
        "type": "array",
        "items": { "type": "string", "minLength": 1 }
      },
      "provenance": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["source","generator","created_at"],
          "properties": {
            "source": { "type": "string", "enum": ALLOWED_SOURCES },
            "generator": { "type": "string", "minLength": 1 },
            "projectId": { "type": "string" },
            "commit_sha": { "type": "string" },
            "created_at": { "type": "string", "format": "date-time" }
          }
        }
      },
      "hash": { "type": "string", "pattern": "^[0-9a-f]{64}$" }
    },
    "$defs": {
      "loc": {
        "type": "object",
        "additionalProperties": false,
        "required": ["path","start_line"],
        "properties": {
          "path": { "type": "string", "minLength": 1 },
          "start_line": { "type": "integer", "minimum": 1 },
          "end_line": { "type": "integer", "minimum": 1 }
        }
      },
      "item": {
        "type": "object",
        "additionalProperties": false,
        "required": ["kind","section","loc","sha256","source"],
        "properties": {
          "kind": { "type": "string", "minLength": 1 },
          "section": { "type": "string", "enum": ALLOWED_SECTIONS },
          "loc": { "$ref": "#/$defs/loc" },
          "symbol": { "type": "string" },
          "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
          "source": { "type": "string", "enum": ALLOWED_SOURCES },
          "reason": { "type": "string" }
        }
      },
      "itemArray": {
        "type": "array",
        "items": { "$ref": "#/$defs/item" }
      }
    }
  };
}
