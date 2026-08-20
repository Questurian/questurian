import Link from "next/link";
import type { JSX } from "react";
import type {
  AuthorArticleItem,
  PublicAuthor,
} from "@/features/authors/lib/fetchAuthor";
import { AuthorSocialIcons } from "@/features/authors/components/AuthorSocialLinks";
import { AuthorAvatar } from "@/features/authors/components/AuthorAvatar";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function articleLabel(article: AuthorArticleItem): string {
  if (article.href.includes("/itineraries/")) return "Itineraries";
  if (article.href.includes("/maps/")) return "City guides";
  return "Travel";
}

function ArticleThumbnail({
  thumbnail,
}: {
  thumbnail: AuthorArticleItem["thumbnail"];
}): JSX.Element {
  if (!thumbnail?.url) {
    return (
      <div
        aria-hidden="true"
        className="aspect-[16/10] w-full bg-paper-accent"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbnail.url}
      alt={thumbnail.alt ?? ""}
      className="aspect-[16/10] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025] motion-reduce:transition-none"
      loading="lazy"
      decoding="async"
    />
  );
}

function ArticleCard({
  article,
  authorName,
}: {
  article: AuthorArticleItem;
  authorName: string;
}): JSX.Element {
  const date = formatDate(article.publishedAt);

  return (
    <article className="border-t border-foreground/20 pt-7 first:border-t-0 first:pt-0 md:border-t-0 md:pt-0">
      <Link
        href={article.href}
        className="group block outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <div className="overflow-hidden bg-paper">
          <ArticleThumbnail thumbnail={article.thumbnail} />
        </div>
        <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.13em] text-accent">
          {articleLabel(article)}
        </p>
        <h3 className="mt-2 font-display text-[26px] font-medium leading-[1.12] tracking-[-0.015em] text-foreground sm:text-[29px]">
          {article.title}
        </h3>
        <p className="mt-4 font-editorial text-[16px] italic leading-none text-foreground/65">
          {date ? `${date} · ` : ""}
          {authorName}
        </p>
      </Link>
    </article>
  );
}

export function AuthorPage({ author }: { author: PublicAuthor }): JSX.Element {
  const name = author.displayName ?? "Questurian";
  const bio = author.bio ?? `${name} is a contributing writer at Questurian.`;

  return (
    <main className="bg-background text-foreground">
      <header className="mx-auto w-full max-w-[1400px] px-5 pt-14 sm:px-8 sm:pt-20 lg:px-10 lg:pt-24">
        <div className="grid max-w-[1080px] gap-9 sm:grid-cols-[auto_1fr] sm:items-start sm:gap-10 lg:gap-14">
          <AuthorAvatar avatar={author.avatar} name={name} />

          <div className="min-w-0 pt-1">
            <h1 className="font-display text-[43px] font-medium leading-[0.98] tracking-[-0.035em] text-foreground sm:text-[58px] lg:text-[68px]">
              {name}
            </h1>
            <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.16em] text-accent sm:text-[13px]">
              Questurian contributor
            </p>
            <div className="mt-5">
              <AuthorSocialIcons links={author.socialLinks} authorName={name} />
            </div>
          </div>
        </div>

        <p className="mt-10 max-w-[900px] font-editorial text-[21px] leading-[1.5] text-foreground/90 sm:mt-12 sm:text-[24px] lg:text-[26px]">
          {bio}
        </p>

        <div className="mt-12 h-px w-full max-w-[1000px] bg-foreground/20 sm:mt-16" />
      </header>

      <section
        aria-labelledby="recent-articles-heading"
        className="mx-auto w-full max-w-[1400px] px-5 pb-24 pt-24 sm:px-8 sm:pb-28 sm:pt-32 lg:px-10 lg:pt-40"
      >
        <h2
          id="recent-articles-heading"
          className="font-editorial text-[38px] font-medium uppercase leading-none tracking-[-0.03em] text-foreground sm:text-[48px] lg:text-[54px]"
        >
          More recent articles
        </h2>

        {author.articles.length > 0 ? (
          <div className="mt-10 grid gap-x-6 gap-y-14 md:grid-cols-2 md:gap-y-16 lg:grid-cols-3 lg:gap-x-7">
            {author.articles.map((article) => (
              <ArticleCard
                key={article.href}
                article={article}
                authorName={name}
              />
            ))}
          </div>
        ) : (
          <p className="mt-10 border-t border-foreground/20 py-12 font-editorial text-[20px] text-foreground/60">
            No published articles yet.
          </p>
        )}
      </section>
    </main>
  );
}
