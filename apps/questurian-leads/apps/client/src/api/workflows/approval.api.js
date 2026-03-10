import { request } from '../client';
import { withQuery } from '../utils/queryParams';

function buildApprovalPayload(contentType, contentId, approvedBy, status, notes = null) {
  return {
    content_type: contentType,
    content_id: contentId,
    status,
    approved_by: approvedBy,
    approval_notes: notes,
  };
}

export const approvalApi = {
  getPending: (contentType = null, limit = 100, offset = 0) => {
    const params = {
      limit,
      offset,
      ...(contentType ? { content_type: contentType } : {}),
    };
    return request(withQuery('/approval/pending', params));
  },
  approve: (contentType, contentId, approvedBy, notes = null) =>
    request('/approval/approve', {
      method: 'POST',
      body: JSON.stringify(
        buildApprovalPayload(contentType, contentId, approvedBy, 'approved', notes),
      ),
    }),
  reject: (contentType, contentId, approvedBy, notes = null) =>
    request('/approval/approve', {
      method: 'POST',
      body: JSON.stringify(
        buildApprovalPayload(contentType, contentId, approvedBy, 'rejected', notes),
      ),
    }),
  batchApprove: (items) =>
    request('/approval/approve/batch', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  getStats: () => request('/approval/stats'),
};
