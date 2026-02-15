/**
 * JSON Export Checklist Component
 * Shows schema coverage for Location Export and AI JSON Export formats
 */

import type { JsonExportChecklist as JsonExportChecklistType } from '@shared/types/location';
import { getStatusIcon } from './utils';

interface JsonExportChecklistProps {
  checklist: JsonExportChecklistType | null;
  isLoading: boolean;
  onDownloadLocation?: () => void;
  onDownloadAiJson?: () => void;
}

export function JsonExportChecklist({
  checklist,
  isLoading,
  onDownloadLocation,
  onDownloadAiJson,
}: JsonExportChecklistProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center text-gray-500">
          <div className="animate-spin mb-2">⏳</div>
          <p>Loading checklist...</p>
        </div>
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No checklist data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Exports Overview */}
      <div className="grid grid-cols-2 gap-4">
        {/* Location Export */}
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-blue-900">Location Export</h3>
            <span className="text-xl">{getStatusIcon('complete')}</span>
          </div>
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-blue-700">Coverage</span>
                <span className="text-sm font-semibold text-blue-900">{checklist.locationExport.completionPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${checklist.locationExport.completionPercent}%` }}
                />
              </div>
            </div>
            <div className="text-sm text-blue-700">
              <p>Size: {checklist.locationExport.fileSize}</p>
              <p>Sections: {checklist.locationExport.sections.length}</p>
            </div>
          </div>
        </div>

        {/* AI JSON Export */}
        <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-purple-900">AI JSON Export</h3>
            <span className="text-xl">{getStatusIcon('complete')}</span>
          </div>
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-purple-700">Coverage</span>
                <span className="text-sm font-semibold text-purple-900">{checklist.aiJsonExport.completionPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-purple-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-600 transition-all duration-300"
                  style={{ width: `${checklist.aiJsonExport.completionPercent}%` }}
                />
              </div>
            </div>
            <div className="text-sm text-purple-700">
              <p>Size: {checklist.aiJsonExport.fileSize}</p>
              <p>Quality: {(checklist.aiJsonExport.qualityScore * 100).toFixed(0)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Schema Sections */}
      <div className="space-y-4">
        <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">
          Schema Coverage Details
        </h4>

        {/* Location Export Sections */}
        <div className="bg-white border border-blue-200 rounded-lg overflow-hidden">
          <div className="bg-blue-50 px-4 py-2 border-b border-blue-200">
            <h5 className="font-semibold text-blue-900">Location Export</h5>
          </div>
          <div className="divide-y divide-blue-100">
            {checklist.locationExport.sections.map((section: typeof checklist.locationExport.sections[0], idx: number) => (
              <div key={idx} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h6 className="font-medium text-gray-900">{section.name}</h6>
                  <span className="text-sm font-semibold text-gray-900">{section.completionPercent}%</span>
                </div>
                <div className="w-full h-1 bg-blue-100 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${section.completionPercent}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {section.fields.slice(0, 4).map((field: typeof section.fields[0], fIdx: number) => (
                    <div key={fIdx} className="flex items-center gap-1">
                      <span>{getStatusIcon(field.status)}</span>
                      <span className="text-gray-600">{field.name}</span>
                    </div>
                  ))}
                  {section.fields.length > 4 && (
                    <div className="text-gray-500">+{section.fields.length - 4} more</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI JSON Export Sections */}
        <div className="bg-white border border-purple-200 rounded-lg overflow-hidden">
          <div className="bg-purple-50 px-4 py-2 border-b border-purple-200">
            <h5 className="font-semibold text-purple-900">AI JSON Export</h5>
          </div>
          <div className="divide-y divide-purple-100">
            {checklist.aiJsonExport.sections.map((section: typeof checklist.aiJsonExport.sections[0], idx: number) => (
              <div key={idx} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h6 className="font-medium text-gray-900">{section.name}</h6>
                  <span className="text-sm font-semibold text-gray-900">{section.completionPercent}%</span>
                </div>
                <div className="w-full h-1 bg-purple-100 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-purple-500"
                    style={{ width: `${section.completionPercent}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {section.fields.slice(0, 4).map((field: typeof section.fields[0], fIdx: number) => (
                    <div key={fIdx} className="flex items-center gap-1">
                      <span>{getStatusIcon(field.status)}</span>
                      <span className="text-gray-600">{field.name}</span>
                    </div>
                  ))}
                  {section.fields.length > 4 && (
                    <div className="text-gray-500">+{section.fields.length - 4} more</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison */}
      {(checklist.comparison.fieldsOnlyInLocationExport.length > 0 ||
        checklist.comparison.fieldsOnlyInAiJson.length > 0) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Format Differences</h4>
          <div className="grid grid-cols-2 gap-4">
            {checklist.comparison.fieldsOnlyInLocationExport.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Location Export Only</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  {checklist.comparison.fieldsOnlyInLocationExport.map((field: string, idx: number) => (
                    <li key={idx}>• {field}</li>
                  ))}
                </ul>
              </div>
            )}
            {checklist.comparison.fieldsOnlyInAiJson.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">AI JSON Only</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  {checklist.comparison.fieldsOnlyInAiJson.map((field: string, idx: number) => (
                    <li key={idx}>• {field}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Download buttons */}
      <div className="grid grid-cols-2 gap-3 pt-4">
        <button
          disabled={isLoading || !checklist.locationExport.canExport}
          onClick={onDownloadLocation}
          className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
        >
          📥 Download Location JSON
        </button>
        <button
          disabled={isLoading || !checklist.aiJsonExport.canExport}
          onClick={onDownloadAiJson}
          className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
        >
          📥 Download AI JSON
        </button>
      </div>
    </div>
  );
}
