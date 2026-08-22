# Clean neighborhood homepage URLs share the three-segment resolver

Neighborhood homepages use `/{country}/{city}/{neighborhood}` rather than adding a `/neighborhoods/` path segment. The existing three-segment route also serves country-scoped articles, so it first resolves an enabled, published neighborhood under a recognized city and otherwise preserves canonical article lookup. This dispatch is unambiguous because location validation prevents city slugs from colliding with article-category slugs; the clean public URL is worth the small resolver branch and avoids durable routing chrome.
