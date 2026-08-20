import Link from "next/link";
import type { JSX } from "react";
import type {
  AuthorArticleItem,
  PublicAuthor,
} from "@/features/authors/lib/fetchAuthor";
import { AuthorSocialIcons } from "@/features/authors/components/AuthorSocialLinks";
import { AuthorAvatar } from "@/features/authors/components/AuthorAvatar";
import { EditorialLabelRule } from "@/features/articles/components/EditorialRule";

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
}: {
  article: AuthorArticleItem;
}): JSX.Element {
  const date = formatDate(article.publishedAt);

  return (
    <article className="border-t border-foreground/20 pt-6 first:border-t-0 first:pt-0 md:border-t-0 md:pt-0">
      <Link
        href={article.href}
        className="group block outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <div className="overflow-hidden bg-paper">
          <ArticleThumbnail thumbnail={article.thumbnail} />
        </div>
        <p className="mt-3.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-accent">
          {articleLabel(article)}
        </p>
        <h3 className="mt-1.5 font-display text-[20px] font-medium leading-[1.18] tracking-[-0.015em] text-foreground sm:text-[22px]">
          {article.title}
        </h3>
        {date ? (
          <p className="mt-2 text-[13px] leading-snug text-foreground/55">
            {date}
          </p>
        ) : null}
      </Link>
    </article>
  );
}

export function AuthorPage({ author }: { author: PublicAuthor }): JSX.Element {
  const name = author.displayName ?? "Questurian";
  const bio = author.bio ?? `${name} is a contributing writer at Questurian.`;

  return (
    <main className="bg-background text-foreground">
      <header className="mx-auto w-full max-w-[1080px] px-5 pt-10 sm:px-8 sm:pt-12 lg:px-10 lg:pt-14">
        <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start sm:gap-7">
          <AuthorAvatar avatar={author.avatar} name={name} />

          <div className="min-w-0">
            <p className="font-[family-name:var(--font-dm-sans)] text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-accent sm:text-[11px]">
              Questurian contributor
            </p>
            <h1 className="mt-2.5 font-display text-[30px] font-medium leading-[1.08] tracking-[-0.02em] text-foreground sm:text-[36px] lg:text-[40px]">
              {name}
            </h1>
            <div className="mt-3.5">
              <AuthorSocialIcons links={author.socialLinks} authorName={name} />
            </div>
            <p className="mt-5 max-w-[36rem] text-[15px] leading-[1.65] text-foreground/75 sm:text-[16px]">
              {bio}
            </p>
          </div>
        </div>
      </header>

      <section
        aria-label="Articles"
        className="mx-auto w-full max-w-[1080px] px-5 pb-20 pt-10 sm:px-8 sm:pb-24 sm:pt-12 lg:px-10"
      >
        <EditorialLabelRule>Articles</EditorialLabelRule>

        {author.articles.length > 0 ? (
          <div className="mt-8 grid gap-x-6 gap-y-10 md:grid-cols-2 md:gap-y-12 lg:grid-cols-3 lg:gap-x-7">
            {author.articles.map((article) => (
              <ArticleCard key={article.href} article={article} />
            ))}
          </div>
        ) : (
          <p className="mt-8 border-t border-foreground/20 py-10 text-[15px] text-foreground/55">
            No published articles yet.
          </p>
        )}
      </section>
    </main>
  );
}
