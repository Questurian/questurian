import Link from "next/link";

import type {
  AuthorFeatureBlock,
  AuthorFeatureCard,
  FeaturedArticleTeaser,
  HomepageBlockLayoutProps,
} from "../../../types";
import { BlockSection } from "../BlockSection";

function Linked({
  href,
  className,
  children,
}: {
  href: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return href ? (
    <Link href={href} className={className} data-no-hover-underline>
      {children}
    </Link>
  ) : (
    <>{children}</>
  );
}

function imageForStyle(
  card: AuthorFeatureCard,
  style: AuthorFeatureBlock["imageStyle"],
) {
  return style === "circle" || style === "square"
    ? (card.imageSquare ?? card.image ?? card.imageWide)
    : (card.image ?? card.imageSquare ?? card.imageWide);
}

function AuthorPortrait({
  card,
  style,
}: {
  card: AuthorFeatureCard;
  style: AuthorFeatureBlock["imageStyle"];
}) {
  const image = imageForStyle(card, style);
  const wide = card.imageWide ?? image;
  const shaped = style === "circle" || style === "square";
  const square = style === "square";
  const circle = style === "circle";
  const decorated = square || circle;
  const shapeClass = circle
    ? "relative aspect-square w-[56%] 768:w-[78%]"
    : square
      ? "relative aspect-square w-[58%] 768:w-[80%]"
      : "h-full w-full overflow-hidden";
  return (
    <div
      className={`grid aspect-[16/10] place-items-center overflow-hidden 768:aspect-[4/5] ${decorated ? "bg-transparent" : "bg-paper"}`}
    >
      {image?.url || wide?.url ? (
        <Linked
          href={card.author.href}
          className={`block outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background ${shapeClass}`}
        >
          {decorated ? (
            <span
              aria-hidden="true"
              className={`absolute inset-0 translate-x-[-3%] translate-y-[3%] bg-accent ${circle ? "rounded-full" : ""}`}
            />
          ) : null}
          <span
            className={
              square
                ? "relative z-10 block aspect-square w-full overflow-hidden ring-1 ring-foreground/15"
                : circle
                  ? "relative z-10 block aspect-square w-full overflow-hidden rounded-full ring-1 ring-accent/35"
                  : "block h-full w-full"
            }
          >
            <picture className="block h-full w-full">
              {!shaped && image?.url ? (
                <source media="(min-width: 768px)" srcSet={image.url} />
              ) : null}
              <img
                src={(shaped ? image : wide)?.url ?? image?.url ?? ""}
                alt={(shaped ? image : wide)?.alt ?? image?.alt ?? ""}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </picture>
          </span>
        </Linked>
      ) : null}
    </div>
  );
}

function ArticleImage({
  article,
  square,
}: {
  article: FeaturedArticleTeaser;
  square: boolean;
}) {
  const image = square
    ? (article.imageSquare ?? article.image ?? article.imageWide)
    : (article.imageWide ?? article.image ?? article.imageSquare);
  if (!image?.url) return null;

  return (
    <Linked
      href={article.articlePath}
      className="block h-full w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={image.alt ?? ""}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </Linked>
  );
}

function RelatedArticle({
  article,
  index,
  count,
}: {
  article: FeaturedArticleTeaser;
  index: number;
  count: number;
}) {
  const numbered = count === 6;
  const solo = count === 1;
  const square = count === 2 || count === 3;
  const imageColumn =
    count === 2
      ? "1024:grid-cols-[minmax(120px,48%)_1fr]"
      : "1024:grid-cols-[minmax(96px,38%)_1fr]";

  if (solo) {
    return (
      <article className="flex min-h-0 flex-col border-b border-foreground/25 pb-4">
        <div className="aspect-[16/10] min-h-0 overflow-hidden bg-paper 1024:flex-1 1024:aspect-auto">
          <ArticleImage article={article} square={false} />
        </div>
        <div className="pt-5">
          <p className="mb-2 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-accent">
            {article.category?.name ?? article.articleType ?? "Article"}
          </p>
          <h3 className="font-editorial text-[1.4rem] font-semibold leading-[1.08] text-foreground 1280:text-[1.65rem]">
            <Linked
              href={article.articlePath}
              className="outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {article.title}
            </Linked>
          </h3>
          {article.excerpt ? (
            <p className="mt-3 line-clamp-3 font-editorial text-[0.92rem] leading-[1.45] text-foreground/70">
              {article.excerpt}
            </p>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article
      className={`grid min-w-0 gap-3 border-b border-foreground/25 pb-4 last:border-b-0 ${numbered ? "grid-cols-[2rem_1fr]" : imageColumn}`}
    >
      {numbered ? (
        <span
          aria-hidden="true"
          className="pt-0.5 font-sans text-xs font-semibold tabular-nums text-accent"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
      ) : (
        <div
          className={`${square ? "aspect-square" : "aspect-[16/10]"} overflow-hidden bg-paper`}
        >
          <ArticleImage article={article} square={square} />
        </div>
      )}
      <div className="min-w-0 self-start">
        <p className="mb-1 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-accent">
          {article.category?.name ?? article.articleType ?? "Article"}
        </p>
        <h3 className="font-editorial text-[1.08rem] font-semibold leading-[1.08] text-foreground 1280:text-[1.24rem]">
          <Linked
            href={article.articlePath}
            className="outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {article.title}
          </Linked>
        </h3>
      </div>
    </article>
  );
}

export function AuthorFeaturePreview({
  block,
}: HomepageBlockLayoutProps<AuthorFeatureBlock>) {
  const author = block.authorCard;

  if (!author) return null;

  return (
    <BlockSection
      aria-label={block.sectionHeading ?? "Featured authors"}
      className="bg-background py-8"
    >
      <div className="grid gap-8 768:grid-cols-[minmax(230px,0.82fr)_1.18fr] 768:items-stretch 1024:grid-cols-[minmax(260px,0.9fr)_minmax(280px,0.9fr)_minmax(330px,1.1fr)] 1024:gap-10">
        <AuthorPortrait card={author} style={block.imageStyle} />

        <div className="relative z-20 flex min-w-0 flex-col justify-center border-foreground/30 py-8 text-center 768:border-y 768:px-5 1024:border-y-0 1024:px-0">
          <p className="mb-4 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            {block.sectionHeading || "Author spotlight"}
          </p>
          <h2 className="mx-auto max-w-none text-balance font-display text-[2.55rem] font-medium leading-[0.94] text-foreground 768:max-w-[9ch] 768:text-[3.05rem] 1280:text-[3.35rem]">
            <Linked
              href={author.author.href}
              className="outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {author.author.name ?? "Author"}
            </Linked>
          </h2>
          {author.spotlightNote ? (
            <p className="mx-auto mt-4 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-foreground/55">
              {author.spotlightNote}
            </p>
          ) : null}
          {author.author.bio ? (
            <p className="mx-auto mt-5 max-w-[38rem] font-editorial text-[1rem] leading-[1.5] text-foreground/80">
              <Linked
                href={author.author.href}
                className="outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {author.author.bio}
              </Linked>
            </p>
          ) : null}
          {block.sectionSubheading ? (
            <p className="mx-auto mt-4 max-w-[36rem] font-editorial text-[0.95rem] italic leading-[1.4] text-foreground/65">
              {block.sectionSubheading}
            </p>
          ) : null}
          {author.author.expertise.length ? (
            <p className="mx-auto mt-5 font-sans text-[0.66rem] font-semibold uppercase tracking-[0.11em] text-accent">
              {author.author.expertise.slice(0, 3).join(" / ")}
            </p>
          ) : null}
        </div>

        <div
          className={`grid content-start gap-4 border-foreground/70 768:col-span-2 768:grid-cols-2 768:border-t 768:pt-6 1024:col-span-1 1024:grid-cols-1 1024:border-l 1024:border-t-0 1024:pl-6 1024:pt-0 ${block.totalSlots === 1 ? "1024:grid-rows-1" : ""}`}
        >
          {block.items.map((article, index) => (
            <RelatedArticle
              key={`${article.articlePath ?? article.title}:${index}`}
              article={article}
              index={index}
              count={block.totalSlots}
            />
          ))}
        </div>
      </div>
    </BlockSection>
  );
}
