import { MessageSquare } from "lucide-react";

interface ReviewsStatusBadgeProps {
  hasReviews: boolean;
  reviewsCount?: number | null;
  reviewsFetchedAt?: string | null;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ReviewsStatusBadge({
  hasReviews,
  reviewsCount,
  reviewsFetchedAt,
}: ReviewsStatusBadgeProps) {
  if (!hasReviews || !reviewsCount) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
        <MessageSquare className="w-3 h-3" />
        No reviews
      </span>
    );
  }

  const tooltip = reviewsFetchedAt
    ? `Fetched on ${formatDate(reviewsFetchedAt)}`
    : undefined;

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700"
      title={tooltip}
    >
      <MessageSquare className="w-3 h-3" />
      {reviewsCount} reviews
    </span>
  );
}
