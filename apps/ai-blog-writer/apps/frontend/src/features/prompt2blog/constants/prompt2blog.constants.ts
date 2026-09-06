export const FEATURE_PREFIX = '/prompt2blog'

// This file used to carry the model-picking surface: thirteen model stacks, a
// default of `opus-led-high`, the writer/repair/audit routing each one implied,
// and helpers to resolve a stored id back to a stack. All of it was deleted on
// 2026-09-05, unused.
//
// v4 builds its own run request server-side, in `intake_v4.writing_request`,
// and that function never sets `model_routing` -- so nothing here had reached a
// run since the rebuild. Nothing imported the stacks except their own tests,
// which passed, so the app went on looking like it was configured to write on
// Opus while every call in every run went to the gateway's default of
// gemini-2.5-flash.
//
// The models now live in one place, `packages/model-gateway/.../jobs.json`, and
// the dashboard's Models tab changes them. If a per-run picker is wanted again,
// it has to write `model_routing` on the request, because that field is what
// the pipeline reads. A constant the UI never sends is not a setting.
